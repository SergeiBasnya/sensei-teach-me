import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { View } from "react-native";

const iconPaths = {
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  chat: "M21 11a9 9 0 0 1-9 9H4l-2 2v-11a9 9 0 1 1 19 0Z M7 10h10 M7 14h6",
  book: "M12 5C9 2 4 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-2-10 1v16",
  chart: "M4 20V10 M12 20V4 M20 20V14",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12 M6 18 18 6",
  pause: "M8 5v14 M16 5v14",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  volume: "m11 4-6 5H2v6h3l6 5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0",
  fire: "M12 2c2 5-1 6 2 9 2-1 3-3 3-3 5 6 4 14-5 14S1 14 6 8c0 4 2 4 2 4 0-4 4-6 4-10Z",
  leaf: "M20 3C5 1 1 11 6 17s16 2 14-14Z M4 21l11-12",
  coffee:
    "M4 8h12v8a5 5 0 0 1-12 0Z M16 8h2a3 3 0 0 1 0 6h-2 M6 3v2 M11 2v3 M2 22h17",
  train:
    "M5 17h14V5a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3Z M5 10h14 M9 2v8 M4 22l4-5 M20 22l-4-5 M8 14h1 M15 14h1",
  smile:
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0 M8 14c2 3 6 3 8 0 M8 8h.01 M16 8h.01",
  send: "m22 2-7 20-4-9-9-4Z M11 13 22 2",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  target:
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0 M17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0 M12 12h.01",
  globe:
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0 M2 12h20 M12 2c-5 5-5 15 0 20 5-5 5-15 0-20",
  keyboard:
    "M2 5h20v14H2Z M6 9h.01 M10 9h.01 M14 9h.01 M18 9h.01 M6 13h.01 M10 13h.01 M14 13h.01 M18 13h.01 M7 16h10",
};
export type IconName = keyof typeof iconPaths;
export function Icon({
  name,
  size = 22,
  color = "#747080",
  filled = false,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      <Path d={iconPaths[name]} />
    </Svg>
  );
}

export function Mochi({
  size = 180,
  happy = false,
}: {
  size?: number;
  happy?: boolean;
}) {
  return (
    <View
      accessibilityLabel="Mochi, ton compagnon de japonais"
      accessibilityRole="image"
    >
      <Svg width={size} height={size} viewBox="0 0 240 240">
        <Ellipse
          cx="123"
          cy="215"
          rx="70"
          ry="10"
          fill="#7961B9"
          opacity="0.12"
        />
        <Path
          d="M65 180c-19 17-36 7-32-8 2-9 13-18 26-20 M184 153c16-4 33 7 27 18-5 10-17 14-29 7"
          fill="#B4A0E8"
        />
        <Path
          d="M52 156c-1-62 22-113 68-113 45 0 73 49 72 113 0 36-28 56-70 56-43 0-69-21-70-56Z"
          fill="#B9A5EC"
        />
        <Path
          d="M75 65c-9-31 4-42 17-29l16 19 M146 52l15-24c9-12 24-6 16 30"
          fill="#B9A5EC"
        />
        <Path
          d="M69 148c0-43 17-72 52-72 32 0 54 29 54 72 0 29-20 48-53 48-32 0-53-19-53-48Z"
          fill="#F7F3FF"
        />
        <Ellipse cx="90" cy="141" rx="10" ry="6" fill="#EFB9CD" />
        <Ellipse cx="155" cy="141" rx="10" ry="6" fill="#EFB9CD" />
        {happy ? (
          <G stroke="#332947" strokeWidth="4" fill="none" strokeLinecap="round">
            <Path d="m94 122 5-4 5 4 M139 122l5-4 5 4" />
          </G>
        ) : (
          <G fill="#332947">
            <Ellipse cx="99" cy="124" rx="4" ry="6" />
            <Ellipse cx="144" cy="124" rx="4" ry="6" />
          </G>
        )}
        <Path
          d="M115 140q7 8 14 0"
          fill="none"
          stroke="#332947"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Path d="m108 175 15 8 15-8" fill="#8F73D5" />
        <Path d="m107 174 16-7 16 7-16 9Z" fill="#A48ADE" />
        <Ellipse cx="88" cy="205" rx="15" ry="7" fill="#A78FD9" />
        <Ellipse cx="157" cy="205" rx="15" ry="7" fill="#A78FD9" />
        <Path
          d="m207 65 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z M30 99l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"
          fill="#9B80DB"
        />
      </Svg>
    </View>
  );
}

export function SceneArt({
  kind,
}: {
  kind: "smile" | "coffee" | "train" | "chat";
}) {
  return (
    <Svg width="100%" height="112" viewBox="0 0 240 112" aria-hidden={true}>
      {kind === "coffee" ? (
        <G>
          <Ellipse cx="124" cy="94" rx="62" ry="6" fill="#E2D1BB" />
          <Rect x="64" y="84" width="122" height="6" rx="3" fill="#C5A67D" />
          <Path d="M88 39h66v27c0 28-66 28-66 0Z" fill="#FEFCF6" />
          <Path
            d="M154 44c33-4 31 33 0 28"
            fill="none"
            stroke="#FEFCF6"
            strokeWidth="9"
          />
          <Ellipse cx="121" cy="40" rx="33" ry="7" fill="#FFFDF7" />
          <Ellipse cx="121" cy="41" rx="26" ry="4" fill="#97704D" />
          <Path
            d="M109 23c-8-10 8-11 1-21 M130 23c-8-10 8-11 1-21"
            fill="none"
            stroke="#C5AA89"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </G>
      ) : kind === "train" ? (
        <G>
          <Path
            d="m76 111 27-42 M168 111l-27-42 M86 94h72 M80 106h85"
            stroke="#9EB5A6"
            strokeWidth="3"
          />
          <Rect x="81" y="11" width="81" height="81" rx="20" fill="#8DAF9F" />
          <Rect x="87" y="18" width="69" height="61" rx="15" fill="#F8FCF9" />
          <Rect x="94" y="31" width="55" height="24" rx="7" fill="#CBDDD4" />
          <Path d="M121 31v24" stroke="#F8FCF9" strokeWidth="3" />
          <Circle cx="99" cy="68" r="4" fill="#EACD88" />
          <Circle cx="144" cy="68" r="4" fill="#EACD88" />
          <Rect x="108" y="22" width="27" height="3" rx="1.5" fill="#8DAF9F" />
        </G>
      ) : (
        <G>
          <Ellipse cx="123" cy="99" rx="51" ry="6" fill="#D2C4EF" />
          <Path
            d="M76 83c0-50 15-72 45-72 29 0 46 24 46 72 0 22-91 22-91 0Z"
            fill="#B9A5EC"
          />
          <Path
            d="M89 76c0-31 11-46 32-46 22 0 33 16 33 46s-65 28-65 0Z"
            fill="#F8F5FF"
          />
          <Circle cx="107" cy="61" r="3" fill="#403452" />
          <Circle cx="137" cy="61" r="3" fill="#403452" />
          <Path
            d="M117 73q5 6 10 0"
            fill="none"
            stroke="#403452"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path d="M163 18h36v23h-16l-8 8v-8h-12Z" fill="#FFF" />
          <Path
            d="M173 27h17 M173 33h12"
            stroke="#B7A4DB"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  );
}
