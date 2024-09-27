import PreCallTest from '@jitsi/precall-test';


export interface PreCallResult {
    throughput: number; // Maximum bandwidth reached in kbps  (kilo bits per second).
    fractionalLoss: number; // Packet loss percentage over all the test traffic.
    rtt: number;  // Round trip time in milliseconds.
    jitter: number; 
    mediaConnectivity: boolean; // Whether the data channel was able to send data or not.
}

// Same interface as a PeerConnection configuration object.
export interface IceServer {
    urls: Array<string> | string;
    username?: string;
    credential?: string;
}

let preCallTest: any = null

/**
 * Run a pre-call test to check the network conditions. It uses a TURN server to establish
 * a connection between two PeerConnections using the server as a relay. Afterwards it sends 
 * some test traffic through a data channel to measure the network conditions, these are 
 * recorded and returned through a Promise.
 * 
 * @param {Array<IceServer>} - The ICE servers to use for the test, these are passes to the PeerConnection constructor. 
 * @returns {Promise<PreCallResult | string>} - A Promise that resolves with the test results or rejects with an error message.
 */
export default async function runPreCallTest(iceServers: Array<IceServer>): Promise<PreCallResult | string> {
    // On initialization, the PreCallTest object simply does some checks and some browsers verifications,
    // these seem to be reusable, so we'll keep the object around.
    preCallTest || (preCallTest = new PreCallTest())

    return new Promise((resolve, reject) => {
        // It's not explicitly stated in the code, but if message is not null, something went wrong,
        // so we'll treat it as an error.
        preCallTest.start(iceServers, (result, message) => {
            if (message) {
                reject(message);
                
                return;
            }

            resolve(result);
        });
    });
}
