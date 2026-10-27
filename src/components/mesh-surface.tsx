import { useEffect, useMemo, useRef } from "react";
import { WebView } from "react-native-webview";
import {
  isAvatarNavigation,
  meshEventSchema,
  meshStateScript,
  type MeshAvatarState,
} from "../lib/mesh-avatar-protocol";

export type MeshSurfaceProps = {
  html: string;
  state: MeshAvatarState;
  ready: boolean;
  onReady: () => void;
  onFailure: () => void;
};

export function MeshSurface({
  html,
  state,
  ready,
  onReady,
  onFailure,
}: MeshSurfaceProps) {
  const ref = useRef<WebView<object>>(null);
  const source = useMemo(() => ({ html }), [html]);
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(meshStateScript(state));
  }, [ready, state]);
  return (
    <WebView<object>
      ref={ref}
      source={source}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) =>
        isAvatarNavigation(request.url)
      }
      onMessage={(event) => {
        try {
          const result = meshEventSchema.safeParse(
            JSON.parse(event.nativeEvent.data),
          );
          if (result.success) {
            if (result.data.type === "mochi:ready") onReady();
            else onFailure();
          }
        } catch {
          /* Les messages qui ne suivent pas le protocole sont ignorés. */
        }
      }}
      onError={onFailure}
      onRenderProcessGone={onFailure}
      onContentProcessDidTerminate={onFailure}
      scrollEnabled={false}
      overScrollMode="never"
      bounces={false}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
      mediaPlaybackRequiresUserAction
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        flex: 1,
        backgroundColor: "transparent",
        opacity: ready ? 1 : 0,
      }}
    />
  );
}
