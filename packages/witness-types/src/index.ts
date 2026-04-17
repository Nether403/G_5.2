export type {
  ConsentActor,
  ConsentDecision,
  ConsentRecord,
  ConsentScope,
  ConsentStatus,
  ConsentStore,
} from "./consent";
export {
  getLatestConsentDecision,
  hasGrantedConsent,
  isConsentScope,
} from "./consent";

export type {
  TestimonyLifecycleState,
  TestimonyParticipantRole,
  TestimonyRecord,
  TestimonySegment,
  TestimonyStore,
} from "./testimony";
