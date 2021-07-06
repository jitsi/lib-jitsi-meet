JWT token authentication Prosody plugin
==================

This plugin implements Prosody authentication provider that verifies client connection based on JWT token described in [RFC7519].
It allows to use any external form of authentication with lib-jitsi-meet. Once your user authenticates you need to
generate the JWT token as described in the RFC and pass it to your client app. Once it connects with valid token is considered authenticated by jitsi-meet system.

During configuration you will need to provide the *application ID* that identifies the client and a *secret* shared by both server and JWT token generator. Like described in the RFC, secret is used to compute HMAC hash value which allows to authenticate generated token. There are many existing libraries which can be used to implement token generator. More info can be found here: [http://jwt.io/#libraries-io]

JWT token authentication currently works only with BOSH connections.

[RFC7519]: https://tools.ietf.org/html/rfc7519
[http://jwt.io/#libraries-io]: http://jwt.io/#libraries-io

### Token structure

The following JWT claims are used in authentication token:
- 'iss' specifies *application ID* which identifies the client app connecting to the server. It should be negotiated with the service provider before generating the token.
- 'room' contains the name of the room for which the token has been allocated. This is *NOT* full MUC room address. Example assuming that we have full MUC 'conference1@muc.server.net' then 'conference1' should be used here.  Alternately, a '*' may be provided, allowing access to all rooms within the domain.
- 'exp' token expiration timestamp as defined in the RFC
- 'sub' contains EITHER the lowercase name of the tenant (for a conference like TENANT1/ROOM with would be 'tenant1') OR the lowercase name of the domain used when authenticating with this token (for a conference like /ROOM). By default assuming that we have full MUC 'conference1@muc.server.net' then 'server.net' should be used here.  Alternately, a '*' may be provided, allowing access to rooms in all tenants within the domain or all domains within the server.
- 'aud' application identifier. This value indicates what service is consuming the token.  It should be negotiated with the service provider before generating the token.

Secret is used to compute HMAC hash value and verify the token for HS256 tokens.  

Alternately the token may be signed by a private key and authorized via public keyserver using RS256 tokens.  In this mode, the 'kid' header of the JWT must be set to the name of the public key.  The backend server must be configured to fetch and confirm keys from a pre-configured public keyserver.

### Token Identifiers

In addition to the basic claims used in authentication, the token can also provide user display information in the 'context' field within the JWT payload. None of the information in the context field is used for token validation:
- 'group' is a string which specifies the group the user belongs to.  Intended for use in reporting/analytics, not used for token validation.
- 'user' is an object which contains display information for the current user
  - 'id' is a user identifier string.  Intended for use in reporting/analytics
  - 'name' is the display name of the user
  - 'email' is the email of the user
  - 'avatar' is the URL of the avatar for the user
- 'callee' is an optional object containing display information when launching a 1-1 video call with a single other participant.  It used to display an overlay to the first user, before the second user joins.
  - 'id' is a user identifier string.  Intended for use in reporting/analytics
  - 'name' is the display name of the 'callee' user
  - 'avatar' is the URL of the avatar of the 'callee'

#### Access token identifiers / context
To access the data in lib-jitsi-meet you have to enable the prosody module `mod_presence_identity` in your config.

```lua
VirtualHost "jitmeet.example.com"
    modules_enabled = { "presence_identity" }
```

The data is now available as the identity in the JitsiParticipant class. You can access them by e.g. listening to the `USER_JOINED` event.

NOTE: The values in the token shall always be valid values. If you define e.g. the avatar as `null` it will throw an error.

### Example Token
#### Headers (using RS256 public key validation)
```
{
  "kid": "jitsi/custom_key_name",
  "typ": "JWT",
  "alg": "RS256"
}
```
#### Payload
```
{
  "context": {
    "user": {
      "avatar": "https:/gravatar.com/avatar/abc123",
      "name": "John Doe",
      "email": "jdoe@example.com",
      "id": "abcd:a1b2c3-d4e5f6-0abc1-23de-abcdef01fedcba"
    },
    "group": "a123-123-456-789"
  },
  "aud": "jitsi",
  "iss": "my_client",
  "sub": "meet.jit.si",
  "room": "*",
  "exp": 1500006923
}
```
### Token verification

JWT token is currently checked in 2 places:
- when user connects to Prosody through BOSH. Token value is passed as 'token' query paramater of BOSH URL. User uses XMPP anonymous authentication method.
- when MUC room is being created/joined Prosody compares 'room' claim with the actual name of the room. In addition, the 'sub' claim is compare to either the tenant (for TENANT/ROOM URLs) or the base domain (for /ROOM URLs).  This prevents stolen token being abused by unathorized users to allocate new conference rooms in the system. Admin users are not required to provide valid token which is used by Jicofo for example.

### Lib-jitsi-meet options

When JWT authentication is used with *lib-jitsi-meet* the token is passed to *JitsiConference* constructor:

```
var token = {token is provided by your application possibly after some authentication}

JitsiMeetJS.init(initOptions).then(function(){
    connection = new JitsiMeetJS.JitsiConnection(APP_ID, token, options);
    ...
    connection.connect();
});

```

### Jitsi-meet options

In order to start jitsi-meet conference with token you need to specify the token as URL param:
```
https://example.com/angrywhalesgrowhigh?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ
```
At current level of integration every user that joins the conference has to provide the token and not just the one who
creates the room. It should be possible to change that by using second anonymous domain, but that hasn't been tested
yet.



### Installing token plugin

Token authentication can be integrated automatically using Debian package install. Once you have jitsi-meet installed
just install 'jitsi-meet-tokens' on top of it. In order to have it configured automatically at least version 779 of
jitsi-meet is required which comes with special Prosody config template.

```
apt-get install jitsi-meet-tokens
```

Proceed to "Patching Prosody" section to finish configuration.

### Prosody Version

JWT tokens requires prosody 0.11.6 or higher.

Make sure that */etc/prosody/prosody.cfg.lua* contains the line below at the end to include meet host config. That's because Prosody nightly may come with slightly different default config:

```
Include "conf.d/*.cfg.lua"
```

Also check if client to server encryption is not enforced. Otherwise token authentication won't work:
```
c2s_require_encryption=false
```

[here]: https://prosody.im/download/package_repository

### Manual plugin configuration

Modify your Prosody config with these three steps:

\1. Adjust *plugin_paths* to contain the path pointing to jitsi meet Prosody plugins location. That's where plugins are copied on *jitsi-meet-token* package install. This should be included in global config section(possibly at the beginning of your host config file).

```lua
plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/" }
```

Also optionally set the global settings for key authorization.  Both these options default to the '*' parameter which means accept any issuer or audience string in incoming tokens
```lua
asap_accepted_issuers = { "jitsi", "some-other-issuer" }
asap_accepted_audiences = { "jitsi", "some-other-audience" }
```

\2. Under you domain config change authentication to "token" and provide application ID, secret and optionally token lifetime:

```lua
VirtualHost "jitmeet.example.com"
    authentication = "token";
    app_id = "example_app_id";             -- application identifier
    app_secret = "example_app_secret";     -- application secret known only to your token
    									   -- generator and the plugin
    allow_empty_token = false;             -- tokens are verified only if they are supplied by the client
```

Alternately instead of using a shared secret you can set an asap_key_server to the base URL where valid/accepted public keys can be found by taking a sha256() of the 'kid' field in the JWT token header, and appending .pem to the end

```lua
VirtualHost "jitmeet.example.com"
    authentication = "token";
    app_id = "example_app_id";                                  -- application identifier
    asap_key_server = "https://keyserver.example.com/asap";     -- URL for public keyserver storing keys by kid
    allow_empty_token = false;                                  -- tokens are verified only if they are supplied
```


\3. Enable room name token verification plugin in your MUC component config section:

```lua
Component "conference.jitmeet.example.com" "muc"
    modules_enabled = { "token_verification" }
```
