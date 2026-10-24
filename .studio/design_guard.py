#!/usr/bin/env python3
"""Portable, conservative source guard for PRISMA colored card-edge stripes.

Exit 0: no unallowed source pattern; 1: violations; 2: invalid config/input.
This is a source check, not a rendered-pixel or full CSS/JavaScript evaluator.
"""

import argparse
import fnmatch
import json
import os
import posixpath
import re
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote


GUARD_VERSION = "1.0.1"
CONFIG_VERSION = "studio-design-guard.v1"
REPORT_VERSION = "studio-design-guard-report.v1"
RULE_ID = "no-colored-side-stripes"
SCAN_EXTENSIONS = frozenset((".css", ".scss", ".less", ".html", ".htm", ".astro", ".vue", ".svelte",
                             ".tsx", ".jsx", ".js", ".ts", ".mjs", ".cjs", ".mdx", ".py", ".php", ".erb"))
LIMITS = [
    "Static source patterns only: no claim of complete detection or rendered visual compliance.",
    "Runtime-generated classes/styles, external stylesheets, CSS cascade and preprocessor execution are not evaluated.",
    "Unknown color expressions are treated conservatively; precise functional allowances require human review.",
    "Custom properties use local source/import contexts; unbound tokens or unresolved local imports retain the conservative project-wide fallback.",
    "Font families and the other PRISMA rules are outside this guard's scope.",
]
NEUTRAL_NAMES = {"black", "white", "gray", "grey", "silver", "gainsboro", "whitesmoke", "darkgray", "darkgrey",
                 "lightgray", "lightgrey", "dimgray", "dimgrey", "slategray", "slategrey"}
NEUTRAL_TOKEN = re.compile(r"(?:^|[-_])(?:line|border|divider|separator|neutral|gr[ae]y|muted|paper|surface)(?:[-_\d]|$)", re.I)
SURFACE = re.compile(r"card|panel|section|callout|alert|notice|tile|item|box|proof|dialogue|reply|quote|note|banner|modal|surface|license|licence|focusroom|resource|window|way|finalcta|tablewrap|directanswer|featured|productshot|(?:^|[.#\s])cta(?:$|[:\s])", re.I)
SMALL_GRAPHIC = re.compile(r"icon|avatar|portrait|sprite|character|knob|switch|arrow|chevron|(?:^|[.#\s])(?:button|btn|badge|dot)(?:$|[-_: .])|primarycta|secondarycta|darkcta|headercta|languagelink", re.I)
SIDES = ("top", "right", "bottom", "left")
SIDE_ALIAS = {"inline-start": "left", "inline-end": "right", "block-start": "top", "block-end": "bottom"}


class GuardError(ValueError):
    pass


def normalized(value):
    return re.sub(r"\s+", " ", str(value).strip())


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise GuardError("Duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(GuardError("Invalid JSON number: " + value)))


def relative_path(value, label, glob=False):
    if not isinstance(value, str) or not value.strip() or "\\" in value or "\x00" in value:
        raise GuardError(label + " must be a nonempty relative POSIX path")
    if value.startswith("/") or re.match(r"^[A-Za-z]:", value) or ".." in PurePosixPath(value).parts:
        raise GuardError(label + " must stay inside the project")
    if not glob and any(char in value for char in "*?["):
        raise GuardError(label + " cannot contain a glob")
    return value.removeprefix("./").rstrip("/") or "."


def load_config(path):
    try:
        config = strict_json(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise GuardError("Missing or unreadable design guard configuration: " + str(path)) from error
    keys = {"schemaVersion", "includes", "excludes", "functionalAllowances"}
    if not isinstance(config, dict) or set(config) != keys or config.get("schemaVersion") != CONFIG_VERSION:
        raise GuardError("Config must contain exactly schemaVersion, includes, excludes, functionalAllowances (" + CONFIG_VERSION + ")")
    for key in ("includes", "excludes"):
        if not isinstance(config[key], list) or (key == "includes" and not config[key]):
            raise GuardError(key + " must be a list; includes cannot be empty")
        config[key] = [relative_path(item, key, glob=True) for item in config[key]]
    if any(pattern in (".", "*", "**", "**/*", "**/**") for pattern in config["excludes"]):
        raise GuardError("Blanket exclusions cannot disable design guard coverage")
    for included in config["includes"]:
        prefix = included.split("*", 1)[0].rstrip("/")
        if prefix and prefix != "." and any(excluded in (prefix, prefix + "/**", prefix + "/**/*") for excluded in config["excludes"]):
            raise GuardError("An exclusion covers an entire include root: " + included)
    if not isinstance(config["functionalAllowances"], list):
        raise GuardError("functionalAllowances must be a list")
    seen = set()
    required = {"id", "path", "selector", "property", "value", "reason", "source"}
    for allowance in config["functionalAllowances"]:
        if not isinstance(allowance, dict) or set(allowance) != required:
            raise GuardError("Each functional allowance requires exactly " + ", ".join(sorted(required)))
        for key in required:
            if not isinstance(allowance[key], str) or not allowance[key].strip():
                raise GuardError("Allowance " + key + " must be nonempty")
        if allowance["id"] in seen:
            raise GuardError("Duplicate allowance id: " + allowance["id"])
        seen.add(allowance["id"])
        allowance["path"] = relative_path(allowance["path"], "allowance path")
        if allowance["selector"].strip() in ("*", "body", "html", ":root"):
            raise GuardError("Functional allowances must name a precise selector")
        for key in ("selector", "property", "value"):
            allowance[key] = normalized(allowance[key])
    return config


def matches(path, pattern):
    if pattern == ".":
        return True
    if not any(char in pattern for char in "*?["):
        return path == pattern or path.startswith(pattern + "/")
    patterns = [pattern]
    while patterns[-1].startswith("**/"):
        patterns.append(patterns[-1][3:])
    return any(fnmatch.fnmatchcase(path, item) or PurePosixPath(path).match(item) for item in patterns)


def select_files(root, config, files=None):
    for included in config["includes"]:
        if not any(char in included for char in "*?["):
            path = root / included
            if not path.exists():
                raise GuardError("Include path is missing: " + included)
            if path.is_file() and path.suffix.lower() not in SCAN_EXTENSIONS:
                raise GuardError("Include names an unsupported source type: " + included)
    candidates = []
    if files is None:
        def excluded(relative):
            return any(matches(relative, pattern) for pattern in config["excludes"])
        for directory, subdirectories, filenames in os.walk(root, followlinks=False):
            retained = []
            for name in subdirectories:
                path = Path(directory) / name
                relative = path.relative_to(root).as_posix()
                if excluded(relative) or excluded(relative + "/__design_guard_directory__"):
                    continue
                if path.is_symlink():
                    raise GuardError("Source directory symlink requires explicit exclusion: " + relative)
                retained.append(name)
            subdirectories[:] = retained
            for name in filenames:
                path = Path(directory) / name
                if path.suffix.lower() in SCAN_EXTENSIONS:
                    candidates.append(path)
    else:
        for supplied in files:
            relative = relative_path(str(supplied), "--files path")
            path = root / relative
            if not path.is_file():
                raise GuardError("Selected file is missing: " + relative)
            if path.suffix.lower() in SCAN_EXTENSIONS:
                candidates.append(path)
    selected = []
    for path in sorted(set(candidates)):
        relative = path.relative_to(root).as_posix()
        if not any(matches(relative, pattern) for pattern in config["includes"]):
            continue
        if any(matches(relative, pattern) for pattern in config["excludes"]):
            continue
        if not path.resolve().is_relative_to(root):
            raise GuardError("Selected source escapes the project through a symlink: " + relative)
        selected.append((path, relative))
    return selected


def mask_comments(text):
    # Preserve offsets/line numbers. Quoted URLs and color strings remain intact.
    return re.sub(r"/\*[\s\S]*?\*/|<!--[\s\S]*?-->",
                  lambda match: re.sub(r"[^\n]", " ", match.group()), text)


def split_top(value, delimiter=","):
    result, start, depth, quote, escape = [], 0, 0, None, False
    for index, char in enumerate(value):
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = None
        elif char in "\"'`":
            quote = char
        elif char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == delimiter and depth == 0:
            result.append((value[start:index], start))
            start = index + 1
    result.append((value[start:], start))
    return result


def closing_brace(text, opening):
    depth, quote, escape = 1, None, False
    for index in range(opening + 1, len(text)):
        char = text[index]
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = None
        elif char in "\"'`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    return len(text)


def css_rules(text, offset=0, parent=""):
    cursor = 0
    while cursor < len(text):
        opening = text.find("{", cursor)
        if opening < 0:
            return
        end = closing_brace(text, opening)
        prelude = text[cursor:opening].strip().rsplit(";", 1)[-1].strip()
        body = text[opening + 1:end]
        if prelude.startswith("@"):
            yield from css_rules(body, offset + opening + 1, parent)
        else:
            selector = normalized(prelude)
            if parent and selector:
                selector = normalized(selector.replace("&", parent) if "&" in selector else parent + " " + selector)
            direct = list(body)
            child_cursor = 0
            while True:
                child_open = body.find("{", child_cursor)
                if child_open < 0:
                    break
                child_end = closing_brace(body, child_open)
                child_start = max(body.rfind(";", 0, child_open), body.rfind("}", 0, child_open)) + 1
                for index in range(child_start, min(child_end + 1, len(direct))):
                    if direct[index] != "\n":
                        direct[index] = " "
                child_cursor = child_end + 1
            declarations = css_declarations("".join(direct), offset + opening + 1)
            if selector and (declarations or "@apply" in body):
                yield selector, declarations
            yield from css_rules(body, offset + opening + 1, selector)
        cursor = end + 1


def css_declarations(body, offset=0):
    result = {}
    for part, start in split_top(body, ";"):
        match = re.match(r"\s*([\w-]+)\s*:\s*(.*?)\s*$", part, re.S)
        if match:
            value = re.sub(r"\s*!\s*important\s*$", "", match.group(2), flags=re.I)
            result[match.group(1).lower()] = (normalized(value), offset + start + match.start(1))
    return result


def length_px(value):
    value = value.strip().lower()
    if value in ("thin", "medium", "thick"):
        return {"thin": 1, "medium": 3, "thick": 5}[value]
    match = re.fullmatch(r"(-?(?:\d*\.)?\d+)(px|rem|em)?", value)
    if not match:
        return None
    return float(match[1]) * (16 if match[2] in ("rem", "em") else 1)


def color_kind(value, variables, depth=0):
    value = normalized(value).lower()
    if depth > 8:
        return "unknown"
    if value in ("transparent", "none", "initial", "inherit"):
        return "none" if value in ("transparent", "none") else "unknown"
    variable = re.fullmatch(r"var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)", value)
    if variable:
        resolutions = variables.get(variable[1], [])
        if resolutions:
            kinds = {color_kind(item, variables, depth + 1) for item in resolutions}
            return "colored" if "colored" in kinds else "unknown" if "unknown" in kinds else "neutral"
        if variable[2]:
            return color_kind(variable[2], variables, depth + 1)
        return "neutral" if NEUTRAL_TOKEN.search(variable[1]) else "unknown"
    if value in NEUTRAL_NAMES:
        return "neutral"
    # Tailwind opacity modifiers do not make a neutral token chromatic.
    opacity = re.fullmatch(r"(.+?)/(\d+(?:\.\d+)?|\[\d+(?:\.\d+)?%?\])", value)
    if opacity:
        if float(opacity[2].strip("[]%")) == 0:
            return "none"
        return color_kind(opacity[1], variables, depth + 1)
    if "--color-" + value in variables:
        return color_kind("var(--color-" + value + ")", variables, depth + 1)
    if value.startswith("#"):
        raw = value[1:]
        if len(raw) in (3, 4):
            raw = "".join(char * 2 for char in raw)
        if len(raw) in (6, 8) and re.fullmatch(r"[0-9a-f]+", raw):
            if len(raw) == 8 and int(raw[6:], 16) == 0:
                return "none"
            rgb = [int(raw[index:index + 2], 16) for index in (0, 2, 4)]
            return "neutral" if max(rgb) - min(rgb) <= 24 else "colored"
    function = re.match(r"(rgb|rgba|hsl|hsla)\((.*)\)$", value)
    if function:
        components = re.findall(r"-?(?:\d*\.)?\d+%?", function[2])
        if len(components) >= 3:
            if len(components) >= 4 and float(components[3].rstrip("%")) == 0:
                return "none"
            if function[1].startswith("hsl"):
                return "neutral" if float(components[1].rstrip("%")) <= 10 else "colored"
            rgb = [float(item.rstrip("%")) * (2.55 if item.endswith("%") else 1) for item in components[:3]]
            return "neutral" if max(rgb) - min(rgb) <= 24 else "colored"
    if re.search(r"(?:^|[-_])(?:slate|zinc|stone|neutral|gr[ae]y)(?:[-_\d]|$)", value):
        return "neutral"
    if re.fullmatch(r"[a-z]+(?:-\d+(?:/\d+)?)?", value):
        return "neutral" if NEUTRAL_TOKEN.search(value) else "colored" if value != "currentcolor" else "unknown"
    return "unknown"


def css_color(value):
    match = re.search(r"(?:var|rgba?|hsla?|color-mix|oklch)\(", value, re.I)
    if match:
        start, depth = match.start(), 0
        for index in range(value.find("(", start), len(value)):
            depth += value[index] == "("
            depth -= value[index] == ")"
            if depth == 0:
                return value[start:index + 1]
    match = re.search(r"#[\da-f]{3,8}\b", value, re.I)
    if match:
        return match[0]
    words = [word for word in re.findall(r"[a-zA-Z][\w-]*", value) if word.lower() not in ("solid", "dashed", "dotted", "double", "inset", "outset", "ridge", "groove", "thin", "medium", "thick", "px", "rem", "em", "none", "hidden", "important")]
    return words[-1] if words else "currentColor"


def quad(value):
    parts = [part for part, _ in split_top(value, " ") if part]
    if len(parts) == 1:
        return parts * 4
    if len(parts) == 2:
        return [parts[0], parts[1], parts[0], parts[1]]
    if len(parts) == 3:
        return [parts[0], parts[1], parts[2], parts[1]]
    return parts[:4] if len(parts) >= 4 else ["0"] * 4


def border_parts(value):
    width = next((token for token in value.split() if length_px(token) is not None), "medium")
    hidden = bool(re.search(r"(?:^|\s)(none|hidden)(?:\s|$)", value))
    return ["0" if hidden else width, css_color(value)]


def border_findings(declarations):
    # A color-only directional override may target a border in another file.
    # Unknown width must not be confused with an explicitly disabled border.
    borders = {side: [None, "currentColor", None] for side in SIDES}
    hidden = {side: False for side in SIDES}
    for name, (value, position) in declarations.items():
        if name == "border":
            for side in SIDES:
                borders[side] = border_parts(value) + [(name, value, position)]
                hidden[side] = bool(re.search(r"(?:^|\s)(none|hidden)(?:\s|$)", value))
        elif name in ("border-width", "border-color"):
            for side, part in zip(SIDES, quad(value)):
                borders[side][0 if name.endswith("width") else 1] = part
                borders[side][2] = (name, value, position)
        elif name == "border-style":
            for side, style in zip(SIDES, quad(value)):
                hidden[side] = style in ("none", "hidden")
        elif name in ("border-inline", "border-block"):
            for side in (("left", "right") if name.endswith("inline") else ("top", "bottom")):
                borders[side] = border_parts(value) + [(name, value, position)]
                hidden[side] = bool(re.search(r"(?:^|\s)(none|hidden)(?:\s|$)", value))
        elif re.fullmatch(r"border-(inline|block)-(width|color)", name):
            axis, component = name.split("-")[1:]
            sides = ("left", "right") if axis == "inline" else ("top", "bottom")
            values = [part for part, _ in split_top(value, " ") if part]
            for index, side in enumerate(sides):
                borders[side][0 if component == "width" else 1] = values[min(index, len(values) - 1)]
                borders[side][2] = (name, value, position)
        elif name.startswith("border-"):
            tail = name[7:]
            for alias, side in SIDE_ALIAS.items():
                if tail == alias or tail.startswith(alias + "-"):
                    tail = side + tail[len(alias):]
                    break
            side = tail.split("-")[0]
            if side not in SIDES:
                continue
            if tail == side:
                borders[side] = border_parts(value) + [(name, value, position)]
                hidden[side] = bool(re.search(r"(?:^|\s)(none|hidden)(?:\s|$)", value))
            elif tail.endswith("-width"):
                borders[side][0], borders[side][2] = value, (name, value, position)
            elif tail.endswith("-color"):
                borders[side][1], borders[side][2] = value, (name, value, position)
            elif tail.endswith("-style"):
                hidden[side] = value in ("none", "hidden")
    for side in SIDES:
        width, _, origin = borders[side]
        directional_color = origin and re.fullmatch(
            r"border-(?:left|right|top|bottom|inline(?:-start|-end)?|block(?:-start|-end)?)-color", origin[0])
        borders[side][0] = "0" if hidden[side] else width or ("medium" if directional_color else "0")
    if len({(value[0], value[1]) for value in borders.values()}) == 1:
        return []  # A uniform outline is not an edge stripe.
    result = []
    for side in ("left", "right", "top"):
        width, color, origin = borders[side]
        if origin and length_px(width) != 0:
            result.append(("border-" + side, f"{width} solid {color}", color, origin[2], "edge-border"))
    return result


def split_shadow(value):
    for shadow, _ in split_top(value):
        color = css_color(shadow)
        without_color = shadow.replace(color, " ", 1)
        numbers = re.findall(r"-?(?:\d*\.)?\d+(?:px|rem|em)?", without_color)
        lengths = [length_px(number) for number in numbers]
        if len(lengths) >= 2:
            lengths += [0] * (4 - len(lengths))
            yield lengths[:4], color, "inset" in shadow, normalized(shadow)


def check_declarations(selector, declarations, variables, text, path, findings, context="", signature_variables=None):
    def add(prop, value, position, kind, message):
        # Exact allowances must also notice changes to an explicitly referenced token.
        evidence = variables if signature_variables is None else signature_variables
        references = set(re.findall(r"var\(\s*(--[\w-]+)", value))
        references.update("--color-" + token for token in re.findall(r"[\w-]+", value)
                          if "--color-" + token in evidence)
        resolved = {}
        pending = list(references)
        while pending and len(resolved) < 64:
            reference = pending.pop()
            if reference in resolved or reference not in evidence:
                continue
            resolved[reference] = sorted(set(evidence[reference]))
            for item in evidence[reference]:
                pending.extend(re.findall(r"var\(\s*(--[\w-]+)", item))
        if resolved:
            value += " | vars " + json.dumps(resolved, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        finding = {"path": path, "line": text.count("\n", 0, position) + 1, "selector": normalized(selector),
                   "property": prop, "value": normalized(value), "kind": kind, "message": message}
        if finding not in findings:
            findings.append(finding)

    for prop, value, color, position, kind in border_findings(declarations):
        if color_kind(color, variables) not in ("neutral", "none"):
            add(prop, value, position, kind, "Colored directional border may form a forbidden card/list/panel stripe; remove it or document a precise functional allowance.")
    shadow = declarations.get("box-shadow")
    if shadow:
        for (x, y, blur, spread), color, inset, part in split_shadow(shadow[0]):
            if (
                color_kind(color, variables) in ("neutral", "none")
                or (blur is not None and blur > 0)
                or (x == 0 and y == 0)
            ):
                continue
            surface = SURFACE.search(selector + " " + context) or re.search(r"^element:(?:div|article|section|aside|li|blockquote|dialog)@|^literal@|^inline@", selector)
            action = re.search(r"(?:^|[\s>])(?:a|button)(?::[^ ]+)?$", selector) and not re.search(r"card|shot|item|tile|proof", selector, re.I)
            if inset or (surface and not SMALL_GRAPHIC.search(selector + " " + context) and not action):
                add("box-shadow", part, shadow[1], "inset-stripe" if inset else "hard-shadow-stripe",
                    "A hard colored shadow forms a directional ribbon around a surface.")
    background = declarations.get("background-color", declarations.get("background", declarations.get("background-image")))
    if not background:
        return
    color, position = background
    width = declarations.get("width", declarations.get("inline-size", ("", 0)))[0]
    height = declarations.get("height", declarations.get("block-size", ("", 0)))[0]
    w, h = length_px(width), length_px(height)
    vertical_stretch = any(key in declarations for key in ("inset", "inset-block")) or ("top" in declarations and "bottom" in declarations)
    horizontal_stretch = any(key in declarations for key in ("inset", "inset-inline")) or ("left" in declarations and "right" in declarations)
    vertical = w is not None and 0 < w <= 12 and (height.endswith("%") or vertical_stretch or (h is not None and h >= max(24, w * 3)))
    horizontal = h is not None and 0 < h <= 12 and (width.endswith("%") or horizontal_stretch or (w is not None and w >= max(24, h * 3)))
    tone = color_kind(color, variables)
    thick_neutral_surface = (
        tone == "neutral"
        and SURFACE.search(selector)
        and (
            (vertical and w is not None and w > 1)
            or (horizontal and h is not None and h > 1)
        )
    )
    if (vertical or horizontal) and (tone not in ("neutral", "none") or thick_neutral_surface):
        value = f"width:{width or 'stretch'}; height:{height or 'stretch'}; background:{color}"
        add("background", value, position, "pseudo-stripe" if "::" in selector else "thin-element-stripe",
            "A thin colored element may recreate a forbidden edge or card-heading stripe.")
    if re.search(r"linear-gradient\(\s*(?:90deg|180deg|270deg|to (?:right|left|top|bottom))", color, re.I) and "transparent" in color.lower():
        stops = re.findall(r"(?<![\d.])([1-9](?:\.\d+)?|1[012])px", color)
        colored = re.search(r"(?:#[\da-f]{3,8}\b|(?:var|rgba?|hsla?)\([^)]*\)|\b(?:red|blue|green|yellow|orange|purple|pink|teal|cyan|indigo)\b)", color, re.I)
        if stops and colored and color_kind(colored[0], variables) not in ("neutral", "none"):
            add("background", color, position, "gradient-stripe", "A narrow colored gradient stop may paint an edge stripe.")
    if "gradient(" in color and re.search(r"(?:top|left|right)\s*/\s*(?:100%\s+(?:[1-9]|1[012])(?:\.\d+)?px|(?:[1-9]|1[012])(?:\.\d+)?px\s+100%)", color):
        if color_kind(css_color(color), variables) not in ("neutral", "none"):
            add("background", color, position, "gradient-stripe", "A background gradient sized as a thin edge paints a card stripe.")


def utility_parts(token):
    pieces = [part for part, _ in split_top(token, ":")]
    return pieces[:-1], pieces[-1].strip("!")


def utility_length(value):
    if value == "px":
        return "1px"
    if value == "full":
        return "100%"
    if value.startswith("[") and value.endswith("]"):
        return value[1:-1].replace("_", " ")
    try:
        return f"{float(value) * 4:g}px"
    except ValueError:
        return value


def utility_color(value):
    if value.startswith("[") and value.endswith("]"):
        return value[1:-1].replace("_", " ")
    if value.startswith("(") and value.endswith(")"):
        return "var(" + value[1:-1] + ")"
    return value


def scan_utilities(value, offset, selector, inherited, variables, text, path, findings, context="", signature_variables=None):
    tokens = [(match[0], offset + match.start()) for match in re.finditer(r"[^\s\"'`]+", value)]
    groups = {}
    for token, position in tokens:
        variants, utility = utility_parts(token)
        key = tuple(variants)
        group = groups.setdefault(key, {})
        border = re.fullmatch(r"border-(l|r|t|b|s|e|x|y)(?:-(.+))?", utility)
        if border:
            side = {"l": "left", "r": "right", "t": "top", "b": "bottom", "s": "inline-start", "e": "inline-end", "x": "inline", "y": "block"}[border[1]]
            suffix = border[2]
            if suffix is None or suffix.isdigit() or (suffix.startswith("[") and length_px(suffix[1:-1]) is not None):
                width = "1px" if suffix is None else suffix[1:-1] if suffix.startswith("[") else suffix + "px"
                group["border-" + side + "-width"] = (width, position)
            else:
                group["border-" + side + "-color"] = (utility_color(suffix), position)
                group.setdefault("border-" + side + "-width", ("medium", position))
        elif utility in ("border", "border-0", "border-2", "border-4", "border-8"):
            group["border-width"] = ("1px" if utility == "border" else utility.split("-")[1] + "px", position)
        elif utility.startswith("border-"):
            group["border-color"] = (utility_color(utility[7:]), position)
        elif utility.startswith("shadow-[") or utility.startswith("inset-shadow-["):
            inside = utility[utility.find("[") + 1:-1].replace("_", " ")
            group["box-shadow"] = (("inset " if utility.startswith("inset-") else "") + inside, position)
        elif utility.startswith("bg-"):
            group["background"] = (utility_color(utility[3:]), position)
        elif utility.startswith("w-"):
            group["width"] = (utility_length(utility[2:]), position)
        elif utility.startswith("h-"):
            group["height"] = (utility_length(utility[2:]), position)
        elif re.match(r"inset-[xy]-", utility):
            for side in (("top", "bottom") if utility[6] == "y" else ("left", "right")):
                group[side] = (utility_length(utility[8:]), position)
        elif re.match(r"(?:left|right|top|bottom)-", utility):
            side, amount = utility.split("-", 1)
            group[side] = (utility_length(amount), position)
        elif utility.startswith("[") and utility.endswith("]") and ":" in utility:
            property_name, arbitrary_value = utility[1:-1].split(":", 1)
            group[property_name] = (arbitrary_value.replace("_", " "), position)
    base = groups.get((), {})
    for variants, declarations in groups.items():
        combined = dict(inherited)
        combined.update(base)
        combined.update(declarations)
        suffix = "".join("::" + item if item in ("before", "after") else ":" + item for item in variants)
        check_declarations(selector + suffix, combined, variables, text, path, findings, context, signature_variables)


def quoted_literals(expression, offset):
    for match in re.finditer(r"([\"'`])((?:\\.|(?!\1)[\s\S])*?)\1", expression):
        yield match[2], offset + match.start(2)


def attributes(raw, offset):
    for match in re.finditer(r"\b([\w:-]+)\s*=\s*", raw):
        start = match.end()
        if start >= len(raw):
            continue
        if raw[start] in "\"'`":
            quote = raw[start]
            end = start + 1
            while end < len(raw) and (raw[end] != quote or raw[end - 1] == "\\"):
                end += 1
            yield match[1], raw[start + 1:end], offset + start + 1, False
        elif raw[start] == "{":
            end = closing_brace(raw, start)
            yield match[1], raw[start + 1:end], offset + start + 1, True


def js_declarations(raw, offset):
    offset += len(raw) - len(raw.lstrip())
    raw = raw.strip()
    result = {}
    for match in re.finditer(r"(?:^|[,{}])\s*([\w]+|['\"][\w-]+['\"])\s*:\s*(?:([\"'`])((?:\\.|(?!\2)[\s\S])*?)\2|([^,}\n]+))", raw):
        property_name = match[1].strip("'\"")
        property_name = re.sub(r"[A-Z]", lambda capital: "-" + capital[0].lower(), property_name)
        value = match[3] if match[2] else match[4].strip()
        if not match[2] and re.fullmatch(r"-?(?:\d*\.)?\d+", value) and re.search(r"width|height|size|top|left|right|bottom", property_name):
            value += "px"
        if isinstance(value, str):
            result[property_name] = (normalized(value), offset + match.start(1))
    return result


def markup_tags(text):
    for match in re.finditer(r"<([A-Za-z][\w:.-]*)\b", text):
        cursor, depth, quote, escape = match.end(), 0, None, False
        while cursor < len(text):
            char = text[cursor]
            if quote:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == quote:
                    quote = None
            elif char in "\"'`":
                quote = char
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            elif char == ">" and depth == 0:
                yield match[1], text[match.end():cursor], match.end(), match.start()
                break
            cursor += 1


def scan_source(text, path, variables, signature_variables=None):
    findings = []
    masked = mask_comments(text)
    suffix = Path(path).suffix.lower()
    if suffix in (".css", ".scss", ".less"):
        regions = [(masked, 0)]
    else:
        regions = [(match[1], match.start(1)) for match in re.finditer(r"<style\b[^>]*>([\s\S]*?)</style\s*>", masked, re.I)]
        regions += [(match[1], match.start(1)) for match in re.finditer(r"(?:\bcss|\bstyled(?:\.[\w]+|\([^)]*\))?)\s*`([\s\S]*?)`", masked)]
        if suffix == ".py":
            regions += [(match[2], match.start(2)) for match in re.finditer(r"('''|\"\"\")([\s\S]*?)\1", masked)
                        if "<style" not in match[2] and re.search(r"[.#][\w-]+[^{}]*\{[^{}]*(?:border|background|box-shadow)", match[2])]
            regions = [(css.replace("{{", "{ ").replace("}}", " }"), offset) for css, offset in regions]
    parsed_rules = [(selector, declarations, css, offset) for css, offset in regions for selector, declarations in css_rules(css, offset)]
    cascades = {}
    for selector, declarations, _, _ in parsed_rules:
        base_selector = re.sub(r":(?:hover|active|focus-visible|focus-within|focus|disabled|checked|visited)\b", "", selector)
        if selector == base_selector:
            cascades.setdefault(base_selector, {}).update(declarations)
    for selector, declarations, css, offset in parsed_rules:
        base_selector = re.sub(r":(?:hover|active|focus-visible|focus-within|focus|disabled|checked|visited)\b", "", selector)
        combined = dict(cascades.get(base_selector, {}))
        combined.update(declarations)
        check_declarations(selector, combined, variables, text, path, findings, signature_variables=signature_variables)
        for apply in re.finditer(r"@apply\s+([^;{}]+)", css):
            # Locate the owning block rather than treating @apply as JavaScript.
            location = offset + apply.start(1)
            start = css.rfind("{", 0, apply.start())
            previous = max(css.rfind("}", 0, start), css.rfind("{", 0, start))
            owner = normalized(css[previous + 1:start])
            if owner == selector:
                scan_utilities(apply[1], location, selector, {}, variables, text, path, findings, signature_variables=signature_variables)
    consumed = []
    for tag, raw, offset, start in markup_tags(masked):
        attrs = list(attributes(raw, offset))
        static_id = next((value for name, value, _, expression in attrs if name == "id" and not expression), None)
        selector = tag + "#" + static_id if static_id else "element:" + tag + "@" + str(text.count("\n", 0, start) + 1)
        declarations = {}
        class_fragments = []
        for name, value, position, expression in attrs:
            if name == "style":
                declarations.update(js_declarations(value, position) if expression else css_declarations(value, position))
            if name in ("class", "className"):
                class_fragments.extend(quoted_literals(value, position) if expression else [(value, position)])
                consumed.append((position, position + len(value)))
        if class_fragments:
            for value, position in class_fragments:
                scan_utilities(value, position, selector, declarations, variables, text, path, findings, raw, signature_variables)
        else:
            check_declarations(selector, declarations, variables, text, path, findings, raw, signature_variables)
    # Class variants may live in helper constants rather than directly in JSX.
    if suffix in (".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".astro", ".vue", ".svelte", ".mdx", ".py", ".php", ".erb"):
        for value, position in quoted_literals(masked, 0):
            if any(left <= position < right for left, right in consumed):
                continue
            if re.search(r"\b(?:border-[lrts exy]|(?:before|after):|(?:inset-)?shadow-\[)", value.replace(" ", " ")):
                scan_utilities(value, position, "literal@" + str(text.count("\n", 0, position) + 1), {}, variables, text, path, findings, signature_variables=signature_variables)
        for match in re.finditer(r"\b(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*(\{[\s\S]*?\})\s*[;\n]", masked):
            declarations = js_declarations(match[2], match.start(2))
            check_declarations("inline@" + str(text.count("\n", 0, match.start()) + 1), declarations, variables, text, path, findings, signature_variables=signature_variables)
        for match in re.finditer(r"\.style\.(border(?:Left|Right|Top|InlineStart|InlineEnd)|boxShadow)\s*=\s*([\"'`])([^\n]*?)\2", masked):
            prop = re.sub(r"[A-Z]", lambda capital: "-" + capital[0].lower(), match[1])
            check_declarations("inline@" + str(text.count("\n", 0, match.start()) + 1), {prop: (match[3], match.start(1))}, variables, text, path, findings, signature_variables=signature_variables)
    return findings


def source_references(text, path):
    """Static dependency hints only: never import, execute or fetch source code."""
    masked = mask_comments(text)
    for match in re.finditer(r"@(?:import|use|forward)\s+(?:url\(\s*)?(?:['\"]([^'\"]+)['\"]|([^\s;)]+))", masked, re.I):
        yield match[1] or match[2], True
    if Path(path).suffix.lower() not in (".css", ".scss", ".less"):
        for match in re.finditer(r"\b(?:import|export)\s+(?:[^;'\"]*?\bfrom\s*)?['\"]([^'\"]+)['\"]|\b(?:import|require)\s*\(\s*['\"]([^'\"]+)['\"]", masked):
            yield match[1] or match[2], False
        for tag, raw, offset, _ in markup_tags(masked):
            attrs = {name.lower(): (value, expression) for name, value, _, expression in attributes(raw, offset)}
            for match in re.finditer(r"\b(rel|href|src)\s*=\s*([^\s\"'`=<>\{]+)", raw, re.I):
                attrs.setdefault(match[1].lower(), (match[2], False))
            if tag.lower() == "link" and attrs.get("rel", ("", False))[1]:
                yield "${dynamic}", True
                continue
            if tag.lower() == "link" and "stylesheet" in attrs.get("rel", ("", False))[0].lower().split():
                target = attrs.get("href")
            elif tag.lower() in ("script", "style"):
                target = attrs.get("src")
            else:
                continue
            if target:
                yield target[0] if not target[1] else "${dynamic}", True


def variable_contexts(sources):
    """Pool tokens within connected sources, not across independent pages.

    A shared stylesheet connects all of its consumers, so conflicting values
    remain blocked. Unbound tokens and incomplete local dependency graphs keep
    the old project-wide fallback instead of trusting a neutral token name.
    Only already selected, in-root sources are used for dependency resolution.
    """
    definitions, project_variables = {}, {}
    links = {path: set() for path in sources}
    unresolved = set()
    for path, text in sources.items():
        local = definitions[path] = {}
        for match in re.finditer(r"(--[\w-]+)\s*:\s*([^;{}]+)", mask_comments(text)):
            name, value = match[1].lower(), normalized(match[2])
            local.setdefault(name, []).append(value)
            project_variables.setdefault(name, []).append(value)
        for reference, stylesheet in source_references(text, path):
            reference = unquote(re.split(r"[?#]", reference, maxsplit=1)[0])
            if not reference or re.match(r"(?:[a-z][a-z\d+.-]*:|//)", reference, re.I):
                continue  # External stylesheets remain outside the static guard.
            if not stylesheet and not reference.startswith((".", "/", "@/", "~/")):
                continue  # Package imports cannot be resolved as local paths.
            if not stylesheet and PurePosixPath(reference).suffix and PurePosixPath(reference).suffix.lower() not in SCAN_EXTENSIONS:
                continue  # JSON/images/fonts are not stylesheet token sources.
            candidates = [posixpath.normpath(posixpath.join(posixpath.dirname(path), reference.lstrip("/")))]
            if reference.startswith("/"):
                # Web roots may be nested in a repository. Keep both possible
                # roots when present, rather than assuming one overrides another.
                candidates.append(posixpath.normpath(reference.lstrip("/")))
            targets = set()
            for candidate in candidates:
                variants = [candidate]
                if not PurePosixPath(candidate).suffix:
                    variants += [candidate + extension for extension in sorted(SCAN_EXTENSIONS)]
                    variants += [candidate + "/index" + extension for extension in sorted(SCAN_EXTENSIONS)]
                targets.update(variant for variant in variants if variant in sources)
            if not targets:
                unresolved.add(path)
            for target in targets:
                links[path].add(target)
                links[target].add(path)
    contexts = {}
    for path in sources:
        if path in contexts:
            continue
        component, pending = set(), [path]
        while pending:
            current = pending.pop()
            if current in component:
                continue
            component.add(current)
            pending.extend(links[current] - component)
        variables = dict(project_variables)
        if not component.intersection(unresolved):
            local = {}
            for current in sorted(component):
                for name, values in definitions[current].items():
                    local.setdefault(name, []).extend(values)
            variables.update(local)
        for current in component:
            contexts[current] = variables
    return contexts, project_variables


def scan_project(root, config_path=None, files=None):
    root = Path(root).resolve()
    if not root.is_dir():
        raise GuardError("Project root is not a directory")
    config_path = Path(config_path) if config_path else root / ".studio/design-guard.json"
    if not config_path.is_absolute():
        config_path = root / config_path
    config = load_config(config_path)
    selected = select_files(root, config, files)
    # A partial scan still needs the selected project's token dependencies.
    context_files = select_files(root, config) if files is not None else selected
    sources = {}
    for path, relative in context_files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise GuardError("Unreadable source: " + relative) from error
        sources[relative] = text
    contexts, project_variables = variable_contexts(sources)
    findings, allowances_used = [], []
    allowance_keys = ("path", "selector", "property", "value")
    for _, relative in selected:
        # Keep existing allowance signatures value-bound to the complete token
        # inventory. Scoping color classification must not loosen exceptions or
        # invalidate reviewed motifs solely by changing the signature format.
        for finding in scan_source(sources[relative], relative, contexts[relative], project_variables):
            allowance = next((item for item in config["functionalAllowances"]
                              if all(item[key] == finding[key] for key in allowance_keys)), None)
            if allowance:
                allowances_used.append(dict(allowance, line=finding["line"], kind=finding["kind"]))
            elif finding not in findings:
                findings.append(finding)
    findings.sort(key=lambda item: (item["path"], item["line"], item["property"], item["selector"]))
    return {"schemaVersion": REPORT_VERSION, "guardVersion": GUARD_VERSION,
            "status": "violations" if findings else "clear", "ruleIds": [RULE_ID], "findings": findings,
            "allowancesUsed": allowances_used, "filesScanned": [relative for _, relative in selected],
            "coverage": "selected-sources" if selected else "no-supported-sources", "limits": LIMITS, "errors": []}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--config")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--files", nargs="+")
    args = parser.parse_args(argv)
    try:
        report = scan_project(args.root, args.config, args.files)
        code = 1 if report["findings"] else 0
    except (GuardError, OSError, ValueError) as error:
        report = {"schemaVersion": REPORT_VERSION, "guardVersion": GUARD_VERSION, "status": "error",
                  "findings": [], "allowancesUsed": [], "filesScanned": [], "limits": LIMITS, "errors": [str(error)]}
        code = 2
    if args.json_output:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("Design guard " + GUARD_VERSION + ": " + report["status"])
        for finding in report["findings"]:
            print(f"{finding['path']}:{finding['line']} {finding['selector']} · {finding['property']}: {finding['value']}")
        for allowance in report["allowancesUsed"]:
            print("Functional allowance " + allowance["id"] + ": " + allowance["reason"] + " — " + allowance["source"])
        for error in report["errors"]:
            print(error, file=sys.stderr)
        print("Source check only; rendered visual review remains required.")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
