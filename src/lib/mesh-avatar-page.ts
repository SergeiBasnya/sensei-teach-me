import { Asset } from "expo-asset";
import { File } from "expo-file-system";

let loading: Promise<string> | undefined;
export function loadMeshAvatarPage() {
  if (!loading) {
    loading = (async () => {
      const asset = Asset.fromModule(
        require("../../assets/avatar/mochi-mesh.html"),
      );
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error("Avatar local indisponible");
      return new File(asset.localUri).text();
    })().catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
