export enum DetectionEvents {
  DETECTOR_STATE_CHANGE = 'detector_state_change',
  AUDIO_INPUT_STATE_CHANGE = 'audio_input_state_changed',
  NO_AUDIO_INPUT = 'no_audio_input_detected',
  VAD_NOISY_DEVICE = 'detection.vad_noise_device',
  VAD_REPORT_PUBLISHED = 'vad-report-published',
  VAD_SCORE_PUBLISHED = 'detection.vad_score_published',
  VAD_TALK_WHILE_MUTED = 'detection.vad_talk_while_muted'
}
