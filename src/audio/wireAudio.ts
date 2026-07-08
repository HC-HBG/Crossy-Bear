import { GameSession, type Phase } from "../state";
import { AudioEngine } from "./AudioEngine";

/** Subscribes to session transitions and triggers the matching synthesised sound. */
export function wireAudio(session: GameSession): AudioEngine {
  const audio = new AudioEngine();
  let lastPhase: Phase = "IDLE";
  let lastSteps = 0;

  session.subscribe((snap) => {
    audio.setMuted(snap.muted);

    const isNewRound =
      snap.phase === "ROUND_ACTIVE" && (lastPhase === "IDLE" || lastPhase === "DEAD" || lastPhase === "CASHED_OUT");
    if (isNewRound) {
      audio.startTensionLayer();
      lastSteps = 0;
    }

    if (snap.phase === "STEP_WON" && snap.stepsCompleted !== lastSteps) {
      lastSteps = snap.stepsCompleted;
      audio.playHop();
      audio.updateTension(snap.totalSteps > 0 ? snap.stepsCompleted / snap.totalSteps : 0);
    }

    if (snap.phase === "DEAD" && lastPhase !== "DEAD") {
      audio.stopTensionLayer();
      if (snap.lastOutcome?.zone === "river") audio.playDeathRiver();
      else audio.playDeathRoad();
    }

    if (snap.phase === "CASHED_OUT" && lastPhase !== "CASHED_OUT") {
      audio.stopTensionLayer();
      audio.playCoinCascade(snap.lastOutcome?.isFinalStep ? 10 : 6);
    }

    lastPhase = snap.phase;
  });

  return audio;
}
