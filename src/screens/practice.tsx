import { View } from "react-native";
import { scenes, freeScene, type Scene } from "../data/lessons";
import { SceneCard } from "../components/scene-card";
import { appStyles as s } from "../styles";
import {
  Badge,
  Button,
  colors,
  IconButton,
  Panel,
  SectionTitle,
  Txt,
} from "../components/ui";
export function Practice({
  start,
  connected,
  onConfigure,
}: {
  start: (scene: Scene) => void;
  connected: boolean;
  onConfigure: () => void;
}) {
  return (
    <View style={{ gap: 28 }}>
      <SectionTitle
        title="À toi de parler"
        detail="Choisis une situation. Mochi t’accompagne, phrase après phrase."
      />
      <View style={{ gap: 16 }}>
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            horizontal
            onPress={() => start(scene)}
            completed={false}
          />
        ))}
      </View>
      <Panel style={{ gap: 15 }}>
        <Badge icon="chat">Conversation libre</Badge>
        <Txt style={{ fontSize: 23, lineHeight: 31, fontWeight: "700" }}>
          De quoi as-tu envie de parler ?
        </Txt>
        <Txt style={{ color: colors.muted, fontSize: 14 }}>
          Pose une question, raconte ta journée ou imagine une situation.{" "}
          {connected
            ? "Mochi adaptera ses réponses à ton niveau."
            : "Connecte ton serveur IA pour les échanges libres et le micro."}
        </Txt>
        <Button
          onPress={connected ? () => start(freeScene) : onConfigure}
          icon="arrow"
          style={{ alignSelf: "flex-start" }}
        >
          {connected ? "Parler avec Mochi" : "Configurer la conversation IA"}
        </Button>
      </Panel>
    </View>
  );
}
