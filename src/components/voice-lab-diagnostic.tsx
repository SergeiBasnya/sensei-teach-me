import { TextInput, View } from "react-native";
import type {
  VoiceLabAsrDiagnostic,
  VoiceLabObservation,
} from "../../shared/voice-lab";
import type { VoiceLabMetrics } from "../lib/voice-lab-metrics";
import { colors, Txt } from "./ui";

/** Ephemeral last turn only. Never passed to learning memory, logs or metrics export. */
export type VoiceLabDiagnosticTurn = {
  turn: number;
  spoken: string;
  final: string;
  asr?: VoiceLabAsrDiagnostic;
  observation?: VoiceLabObservation;
  reply?: string;
};
const ms = (value: number | undefined) =>
  value === undefined ? "non mesuré" : `${(value / 1000).toFixed(2)} s`;
const intentions: Record<string, string> = {
  help_or_repeat: "aide ou répétition",
  topic_shift: "changement de sujet",
  close: "fin de conversation",
  answer_question: "répondre à une question",
  update_or_negation: "modification ou négation",
  invite_completion: "inviter à terminer",
  continue_from_answer: "poursuivre la réponse",
  practice: "pratique aidée",
  assistance: "aide",
  correction: "correction",
  shared_router: "aiguillage partagé",
};
const facts: Record<string, string> = {
  from_place: "Origine",
  residence: "Résidence",
  drink: "Boisson",
  quantity: "Quantité",
  temperature: "Température",
  destination: "Destination",
  ticket_choice: "Type de billet",
  ticket_quantity: "Nombre de billets",
};
const paths = {
  controlled: "Formulation contrôlée",
  generated: "Réponse générée",
  fallback: "Repli contrôlé",
  correction: "Correction",
  help: "Aide",
  repeat: "Reprise de la question",
};
export function VoiceLabDiagnostic({
  value,
  editable,
  onSpoken,
  trace,
}: {
  value: VoiceLabDiagnosticTurn | null;
  editable: boolean;
  onSpoken: (text: string) => void;
  trace: ReturnType<VoiceLabMetrics["latest"]>;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Txt style={{ fontWeight: "600", fontSize: 17 }}>
        Diagnostic du dernier tour
      </Txt>
      <Txt style={{ fontSize: 12, color: colors.muted }}>
        Textes temporaires, effacés à la fermeture ou en désactivant le
        diagnostic. Le bilan partagé contient uniquement des mesures.
      </Txt>
      {value ? (
        <>
          <Txt style={{ fontWeight: "600" }}>
            Ce que j’ai réellement prononcé
          </Txt>
          <TextInput
            accessibilityLabel="Ce que j’ai réellement prononcé"
            editable={editable}
            multiline
            maxLength={1000}
            value={value.spoken}
            onChangeText={onSpoken}
            placeholder={
              editable
                ? "Facultatif : note ta phrase exacte, erreurs comprises"
                : "Mets en pause pour ajouter ta propre référence"
            }
            placeholderTextColor={colors.muted}
            style={{
              color: colors.ink,
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.bg,
              minHeight: 70,
              fontSize: 14,
            }}
          />
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            Ta déclaration, sans vérification audio automatique. Aucun texte à
            valider pour continuer à parler.
          </Txt>
          <Txt style={{ fontWeight: "600" }}>Reconnaissance finale</Txt>
          <Txt selectable>{value.final || "Aucun texte retenu"}</Txt>
          {value.asr && (
            <>
              <Txt style={{ fontSize: 12, color: colors.muted }}>
                Sortie brute Whisper ({value.asr.detectedLanguage}) · segments
                retenus {value.asr.acceptedSegments}, écartés{" "}
                {value.asr.rejectedSegments} · signal {value.asr.signalGate}
              </Txt>
              <Txt selectable>{value.asr.rawText || "Aucune sortie brute"}</Txt>
            </>
          )}
          <Txt style={{ fontWeight: "600" }}>
            Contexte transmis au professeur
          </Txt>
          {value.observation ? (
            <>
              <Txt>
                {paths[value.observation.path]} · intention :{" "}
                {intentions[value.observation.intent] ??
                  value.observation.intent}
              </Txt>
              {value.observation.facts.map((fact, index) => (
                <Txt key={index} style={{ fontSize: 13 }}>
                  {facts[fact.name] ?? fact.name} : {fact.value}
                </Txt>
              ))}
              <Txt style={{ fontSize: 12, color: colors.muted }}>
                Aiguillage et faits extraits du dialogue, à vérifier. Ils ne
                décrivent pas le raisonnement interne du modèle.
              </Txt>
            </>
          ) : (
            <Txt style={{ color: colors.muted }}>
              Aucun traitement pédagogique reçu pour ce tour.
            </Txt>
          )}
          <Txt style={{ fontWeight: "600" }}>Réponse japonaise</Txt>
          <Txt selectable>{value.reply || "Aucune réponse reçue"}</Txt>
        </>
      ) : (
        <Txt style={{ color: colors.muted }}>
          Parle une première fois pour comparer les étapes.
        </Txt>
      )}
      {trace && (
        <View style={{ gap: 5 }}>
          <Txt style={{ fontWeight: "600" }}>
            Chronologie du dernier tour terminé
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Dernière énergie détectée après ouverture :{" "}
            {ms(trace.lastDetectedVoiceAfterCaptureMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Énergie → fin du tour : {ms(trace.finishAfterDetectedVoiceMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Fin du tour → transcription finale : {ms(trace.finalAfterFinishMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Contrôle pédagogique : {ms(trace.server?.correction)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Génération :{" "}
            {ms(
              trace.server?.dialogue_japanese ??
                trace.server?.dialogue_translation ??
                trace.server?.dialogue_compact,
            )}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Première synthèse japonaise : {ms(trace.server?.tts_first)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Transport et distribution, résidu estimé :{" "}
            {ms(trace.transportResidualMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            WAV reçu → demande de lecture : {ms(trace.audioReceiveToRequestMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Demande → événement de lecture :{" "}
            {ms(trace.playbackRequestToPlayingMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Énergie → événement de lecture :{" "}
            {ms(trace.firstJapaneseAfterDetectedVoiceMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Fin du tour → fin de lecture :{" "}
            {ms(trace.lastJapaneseEndedAfterFinishMs)}
          </Txt>
          <Txt style={{ fontSize: 13 }}>
            Fin de lecture → micro prêt :{" "}
            {ms(trace.nextCaptureAfterJapaneseEndedMs)}
          </Txt>
          <Txt style={{ fontSize: 12, color: colors.muted }}>
            L’énergie est une estimation acoustique. L’événement du lecteur ne
            prouve pas le son entendu. Le transport inclut les deux trajets
            réseau et la distribution côté téléphone ; les horloges Mac et
            Android ne sont pas soustraites.
          </Txt>
        </View>
      )}
    </View>
  );
}
