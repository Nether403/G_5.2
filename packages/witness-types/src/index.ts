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
export type {
  SynthesisRecord,
  SynthesisStatus,
  WitnessRecordSource as SynthesisRecordSource,
  SynthesisStore,
} from "./synthesis";
export type {
  AnnotationEntry,
  AnnotationRecord,
  AnnotationStatus,
  WitnessRecordSource as AnnotationRecordSource,
  AnnotationStore,
} from "./annotation";
export type {
  ArchiveCandidateRecord,
  ArchiveCandidateStatus,
  ArchiveCandidateStore,
} from "./archiveCandidate";
export type {
  PublicationBundleRecord,
  PublicationBundleStatus,
  PublicationBundleStore,
} from "./publicationBundle";
export type {
  PublicationBundleExportEntry,
  PublicationBundleManifest,
} from "./publicationArtifact";
