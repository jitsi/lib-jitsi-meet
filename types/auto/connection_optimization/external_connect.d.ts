/**
 * Requests the given webservice that will create the connection and will return
 * the necessary details(rid, sid and jid) to attach to this connection and
 * start using it. This script can be used for optimizing the connection startup
 * time. The function will send AJAX request to a webservice that should
 * create the bosh session much faster than the client because the webservice
 * can be started on the same machine as the XMPP serever.
 *
 * NOTE: It's vert important to execute this function as early as you can for
 * optimal results.
 *
 * @param webserviceUrl the url for the web service that is going to create the
 * connection.
 * @param successCallback callback function called with the result of the AJAX
 * request if the request was successfull. The callback will receive one
 * parameter which will be JS Object with properties - rid, sid and jid. This
 * result should be passed to JitsiConnection.attach method in order to use that
 * connection.
 * @param error_callback callback function called the AJAX request fail. This
 * callback is going to receive one parameter which is going to be JS error
 * object with a reason for failure in it.
 */
declare function createConnectionExternally(webserviceUrl: any, successCallback: any, error_callback: any): void;
