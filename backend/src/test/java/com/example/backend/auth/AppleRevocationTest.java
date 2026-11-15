package com.example.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The exchange with Apple, against a stand-in server with a throwaway key. */
class AppleRevocationTest {

    KeyPair keys;
    String pem;
    HttpServer apple;
    final List<String> requests = new ArrayList<>();
    int tokenStatus = 200;

    @BeforeEach
    void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        keys = generator.generateKeyPair();
        pem = "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(keys.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----\n";
        apple = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        apple.createContext("/auth/token", e -> {
            requests.add("token " + new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"refresh_token\":\"r-1\"}".getBytes(StandardCharsets.UTF_8);
            e.sendResponseHeaders(tokenStatus, body.length);
            e.getResponseBody().write(body);
            e.close();
        });
        apple.createContext("/auth/revoke", e -> {
            requests.add("revoke " + new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            e.sendResponseHeaders(200, -1);
            e.close();
        });
        apple.start();
    }

    @AfterEach
    void tearDown() {
        apple.stop(0);
    }

    AppleRevocation revocation(String key) {
        return new AppleRevocation("TEAM123456", "KEY1234567", key, "com.pilamoremore.app", "http://127.0.0.1:" + apple.getAddress().getPort());
    }

    @Test
    void offUntilEverySettingIsThere() {
        assertThat(revocation("").enabled()).isFalse();
        assertThat(new AppleRevocation("", "KEY1234567", pem, "b", "http://x").enabled()).isFalse();
        assertThat(revocation(pem).enabled()).isTrue();
    }

    @Test
    void readsAKeyWhoseLineBreaksWereFlattened() {
        assertThat(revocation(pem.replace("\n", "\\n")).enabled()).isTrue();
        assertThatThrownBy(() -> revocation("not a key")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theClientSecretIsWhatAppleAsksFor() throws Exception {
        Instant now = Instant.now();
        SignedJWT jwt = SignedJWT.parse(revocation(pem).clientSecret(now));
        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) keys.getPublic()))).isTrue();
        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("ES256");
        assertThat(jwt.getHeader().getKeyID()).isEqualTo("KEY1234567");
        assertThat(jwt.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM123456");
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("com.pilamoremore.app");
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly("https://appleid.apple.com");
        assertThat(jwt.getJWTClaimsSet().getExpirationTime()).isAfter(java.util.Date.from(now));
    }

    @Test
    void exchangesTheCodeThenRevokesTheRefreshToken() throws Exception {
        revocation(pem).revoke("the-code");
        assertThat(requests).hasSize(2);
        String token = URLDecoder.decode(requests.get(0), StandardCharsets.UTF_8);
        assertThat(token).startsWith("token ").contains("code=the-code").contains("grant_type=authorization_code").contains("client_id=com.pilamoremore.app");
        String revoke = URLDecoder.decode(requests.get(1), StandardCharsets.UTF_8);
        assertThat(revoke).startsWith("revoke ").contains("token=r-1").contains("token_type_hint=refresh_token");
    }

    @Test
    void aRefusedCodeIsAnError() {
        tokenStatus = 400;
        assertThatThrownBy(() -> revocation(pem).revoke("expired")).isInstanceOf(IOException.class);
        assertThat(requests).hasSize(1);
    }
}
