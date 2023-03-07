# JSON Web Token (JWT) authentication Prosody plugin

This plugin implements a **Prosody authentication provider** that verifies a client connection based on a JWT
described in [RFC7519]. It allows use of an external form of authentication with _lib-jitsi-meet_.
Once your user authenticates you need to generate the JWT as described in the RFC and pass it to your client app.
Once it connects with a valid token, it is considered authenticated by the jitsi-meet system.

During configuration, you can choose between two JWT validation methods:

* Shared Secret Validation or
* Public Key Validation 

In both cases you will need to provide the _application ID_ that identifies the client.

For the **Shared Secret Validation** an _application secret_ is shared by both the server (Prosody) and the JWT
generation. Take a look at an example structure in [Example Structure > Shared Secret Validation](#shared-secret-validation).
Like described in the RFC, the _shared secret_ is used to compute a HMAC hash value which allows authentication of the 
generated token. There are many existing libraries which can be used to implement token generation. More info can be 
found here: [http://jwt.io/#libraries-io]

For the **Public Key Validation** a _key server_ must be provided via `asap_key_server` to verify the token against a 
provided public key on the given key server. An example structure can be view in [Example Structure > Publiy Key Validation](#public-key-validation)

This is how you generate the keys:
```
openssl genrsa -out keypair.pem 2048
openssl rsa -in keypair.pem -pubout -out publickey.pem
openssl pkcs8 -topk8 -inform PEM -outform DER -nocrypt -in keypair.pem -out moderated.der
```
Get the private_key_id through this command echo -n [NAME_OF_PRIVATE_KEY.der] | shasum -a 256 and change the publickey.pem name to the fetched private_key_id


JWT authentication works with BOSH and WebSocket connections.

### Token Structure

The following JWT claims are used in the authentication token:

- 'iss'
  - specifies the _application ID_ which identifies the client.
    It should be negotiated with the service provider before generating the token.
- 'room'
  - contains either
    - the name of the room - This is *NOT* the full MUC room address.  
      For a full MUC like 'conference1@muc.server.net' it would be 'conference1'.
    - alternatively '*' - allowing access to all rooms within the domain.
- 'exp'
  - token expiration timestamp as defined in the [RFC7519]
- 'sub'
  - contains either
    - the lowercase _tenant_ - for a conference like 'TENANT1/ROOM' it would be 'tenant1', see example below.
    - the lowercase _domain_ - for a full MUC like 'conference1@muc.server.net' it would be 'server.net'.
    - alternatively '*' - allowing access to all rooms in all tenants within the domain or all domains within the server.
- 'aud'
  - application identifier - indicates what service is consuming the token.
    It should be negotiated with the service provider before generating the token.

**Sub with tenant** If the 'sub' contains the tenant. You need to define the tenant in the `muc` when creating a new `JitsiConnection` in the options 
within the `hosts` section, see

```javascript
    const connection = new JitsiMeetJS.JitsiConnection(
    '${applicationId}',
    '${token}',
    {
        serviceUrl: 'wss://server.net/tenant/xmpp-websocket',
        hosts: {
            domain: 'muc.server.net',
            muc: 'conference1.tenant.muc.server.net',
        },
    },
);
```

**Different signature algorithm** It is possible to define the algorithm type used, simply update the `prosody.cfg.lua` file with your chosen type.
e.g `signature_algorithm = "HS512"`

For **Shared Secret Validation** the _shared secret_ is used to compute the HMAC hash value and verify the token for HSXXX (e.g. HS256) tokens. 
Alternatively for the **Public Key Validation** the token may be signed by a private key and authorized via a public
keyserver using RSXXX (e.g. RS256) tokens. In this mode, the 'kid' header of the JWT must be set to the name of the public key.
Prosody must be configured to fetch and confirm keys from a pre-configured public keyserver via `asap_key_server`
see [Manual plugin configuration > 2.](#manual-plugin-configuration)

### Token Identifiers Structure (Optional)

In addition to the basic claims used in authentication, the token can also provide optional user display information in the 
'context' field within the JWT payload. None of the information in the context field is used for token validation:

- 'group' is a string which specifies the group the user belongs to. Intended for use in reporting/analytics, not used
  for token validation.
- 'user' is an object which contains display information for the current user
    - 'id' is a user identifier string. Intended for use in reporting/analytics
    - 'name' is the display name of the user
    - 'email' is the email of the user
    - 'avatar' is the URL of the avatar for the user
- 'callee' is an optional object containing display information when launching a 1-1 video call with a single other
  participant. It is used to display an overlay to the first user, before the second user joins.
    - 'id' is a user identifier string. Intended for use in reporting/analytics
    - 'name' is the display name of the 'callee' user
    - 'avatar' is the URL of the avatar of the 'callee'

**Note:** At the moment all fields in 'user' need to be a valid string, numeric types or `null` will generate an exception.

#### Retrieve 'Token Identifiers' Data

To retrieve the data from `context` in _lib-jitsi-meet_ you have to enable the Prosody module `mod_presence_identity` in your config.

```lua
VirtualHost "jitmeet.example.com"
    modules_enabled = { "presence_identity" }
```

The data is now available in the identity in the JitsiParticipant class. You can retrieve it by e.g. listening to
the `USER_JOINED` event.

**Note:** The values in the token shall always be valid values. If you define e.g. the avatar as `null` it will throw an
error.

### Token Examples

There are two ways to validate the JWT. First one by **Public Key Validation** and the second one by a **Shared Secret Validation**.
The following examples shows the differences of both structures. For example the `kid` key is only needed for public key
validation to define the public key to validate against.

**Note:** the context structure is optional for both, the secret shared and public key validation and is only needed to
display personal information and for statistic purposes.

#### Public Key Validation

##### Headers

`kid` must be the name of the public key to validate the token against.

```json
{
    "kid": "your_public_key_name",
    "typ": "JWT",
    "alg": "RS256"
}
```

##### Payload

```json
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

#### Shared Secret Validation

##### Headers

```json
{
    "typ": "JWT",
    "alg": "RS256"
}
```

##### Payload

```json
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

JWT is currently checked in 2 places:

- when a user connects to Prosody through BOSH or WebSocket. The token value is passed as the 'token' query parameter of 
  the BOSH or WebSocket URL. User uses XMPP anonymous authentication method.
- when a MUC room is being created/joined Prosody compares the 'room' claim with the actual name of the room. In
  addition, the 'sub' claim is compare to either the tenant (for TENANT/ROOM URLs) or the base domain (for /ROOM URLs).
  This prevents a stolen token being abused by unauthorized users to allocate new conference rooms in the system. Admin
  users are not required to provide a valid token which is used for example by Jicofo.

### Lib-jitsi-meet options

When JWT authentication is used with _lib-jitsi-meet_ the token is passed to the _JitsiConference_ constructor:

```javascript
var token = {token_is_provided_by_your_application_possibly_after_some_authentication}

JitsiMeetJS.init(initOptions).then(function () {
    connection = new JitsiMeetJS.JitsiConnection(APP_ID, token, options);
    // ...
    connection.connect();
});
```

### Jitsi-meet options

In order to start a jitsi-meet conference with a token you need to specify the token as an URL param:

`
https://example.com/angrywhalesgrowhigh?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ
`

At the current level of integration every user that joins the conference has to provide the token and not just the one
who creates the room. It should be possible to change that by using a second anonymous domain, but that hasn't been
tested yet.

### Installing the token plugin

Token authentication can be integrated automatically using a Debian package. Once you have `jitsi-meet` installed
just install `jitsi-meet-tokens` on top of it. In order to have it configured automatically at least version 779 of
jitsi-meet is required which comes with a special Prosody config template.

```bash
apt-get install jitsi-meet-tokens
```

Check the "Prosody Version" that is used in the deployment.

### Prosody Version

JWT authentication requires Prosody 0.11.6 or higher.

Make sure that */etc/prosody/prosody.cfg.lua* contains the line below at the end to include meet host config. That's
because Prosody nightly may come with slightly different default config:

```lua
Include "conf.d/*.cfg.lua"
```

Restart the service to take the changes into account

```bash
sudo /etc/init.d/prosody restart
```

[here]: https://prosody.im/download/package_repository

### Manual plugin configuration

Modify your Prosody config with these three steps:

1. Adjust _plugin_paths_ to contain the path pointing to the jitsi meet Prosody plugins location. That's where plugins
   are copied on _jitsi-meet-token_ package installation. This should be included in the global config section (possibly
   at the beginning of your host config file).

    ```lua
    plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/" }
    ```
    
    Also, you need to set the global settings for token authorization. Both these options used to default to the '*' parameter
    which means accept any issuer or audience string in incoming tokens, but that is no longer the case.
    
    ```lua
    asap_accepted_issuers = { "*" }
    asap_accepted_audiences = { "*" }
    ```

2. Under your domain config change `authentication` to `token` and provide the _application ID_ in `app_id`:

    If you want to validate the token via **Shared Secret Validation** add the `app_secret` parameter
    
    ```lua
    VirtualHost "jitmeet.example.com"
        authentication    = "token";
        app_id            = "example_app_id";         -- application identifier
        app_secret        = "example_app_secret";     -- application secret known only to your token
                                                      -- generator and the plugin
        allow_empty_token = false;                    -- tokens are verified only if they are supplied by the client
    ```

   alternatively for the **Public Key Validation** you need to set an `asap_key_server` to the base URL where valid/accepted 
    _public keys_ can be found by taking a sha256() of the `kid` field from the JWT header, and appending .pem to the end
    
    ```lua
    VirtualHost "jitmeet.example.com"
        authentication    = "token";
        app_id            = "example_app_id";                       -- application identifier
        asap_key_server   = "https://keyserver.example.com/asap";   -- URL for public keyserver storing keys by kid
        allow_empty_token = false;                                  -- tokens are verified only if they are supplied
    ```

3. Enable the room name token verification plugin in your MUC component config section:

    ```lua
    Component "conference.jitmeet.example.com" "muc"
        modules_enabled = { "token_verification" }
    ```

[RFC7519]: https://tools.ietf.org/html/rfc7519
[http://jwt.io/#libraries-io]: http://jwt.io/#libraries-io
