export type ReceiverAudioSubscriptionMessage =
	| { mode: "All" }
	| { mode: "None" }
	| {
      mode: "Custom"
      include: string[]
      exclude: string[]
    };
