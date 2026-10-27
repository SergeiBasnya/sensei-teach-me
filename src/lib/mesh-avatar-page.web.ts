import { Asset } from "expo-asset";

let loading: Promise<string> | undefined;
export function loadMeshAvatarPage() {
  if (!loading) {
    const asset = Asset.fromModule(
      require("../../assets/avatar/mochi-mesh.html"),
    );
    loading = fetch(asset.uri)
      .then((response) => {
        if (!response.ok) throw new Error("Avatar local indisponible");
        return response.text();
      })
      .catch((error: unknown) => {
        loading = undefined;
        throw error;
      });
  }
  return loading;
}
