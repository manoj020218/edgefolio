'use strict';

// RS256 public key for verifying EdgeFolio license JWTs.
// The corresponding private key lives on the VPS billing server.
// Do NOT replace this key without deploying a new private key to the VPS.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxPyFOaF+8wXcBQ4YKekn
NmstPVUkyJplt6jZNJ5SeV24uk1n+5lJ8SMyJS9rSyv+SuZntyB5xD4iXF+8v4FX
Xr/BBvoouc55DLZY2ezz+0EkXb5JKEwceV4BIxUyL7UKgvObXU4kZU0XWLStCXUp
1axfgNFgr0xzmkrUGm6ukCHPA/2UlXfMQyhZDfl4iPCJwJwBsKkgYtlPcafbASyY
dTm8TRoGLD7WMw2KTj1jE6Nste8L7qwFx7zFUtFxtCMKn22fRcGj+qIZ0UWRSwQq
EUcZCdXY6Le7PDMfw9VuobnMZDF11tP7OkIRQKKKEjnc7JZh1yii630TXPevZ6LA
GQIDAQAB
-----END PUBLIC KEY-----`;

module.exports = { LICENSE_PUBLIC_KEY };
