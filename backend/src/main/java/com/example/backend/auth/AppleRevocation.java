package com.example.backend.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Tells Apple an account is gone, as App Review asks of apps with Sign in with Apple. Nothing of
 * Apple's is kept between sign-ins: when deleting, the app asks Apple for a fresh authorization code,
 * which is exchanged here for a refresh token and revoked straight away.
 * Empty key settings = off (the sign-in itself needs none of them).
 */
@Component
public class AppleRevocation {

    private static final String AUDIENCE = "https://appleid.apple.com";
    private static final Duration SECRET_LIFETIME = Duration.ofMinutes(5);

    private final String teamId;
    private final String keyId;
    private final String bundleId;
    private final String baseUrl;
    private final ECPrivateKey key;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final JsonMapper json = JsonMapper.builder().build();

    public AppleRevocation(@Value("${pila.apple.team-id:}") String teamId, @Value("${pila.apple.key-id:}") String keyId,
            @Value("${pila.apple.private-key:}") String privateKey, @Value("${pila.apple.bundle-id}") String bundleId,
            @Value("${pila.apple.base-url:https://appleid.apple.com}") String baseUrl) {
        this.teamId = teamId.trim();
        this.keyId = keyId.trim();
        this.bundleId = bundleId;
        this.baseUrl = baseUrl;
        this.key = privateKey.isBlank() ? null : parseKey(privateKey);
    }

    public boolean enabled() {
        return key != null && !teamId.isEmpty() && !keyId.isEmpty();
    }

    /** Exchanges a one-time authorization code for a refresh token, and revokes that. */
    public void revoke(String authorizationCode) throws IOException, InterruptedException, JOSEException {
        String secret = clientSecret(Instant.now());
        JsonNode tokens = json.readTree(post("/auth/token", Map.of("client_id", bundleId, "client_secret", secret, "code", authorizationCode, "grant_type", "authorization_code")));
        String refresh = tokens.path("refresh_token").asString("");
        if (refresh.isEmpty()) throw new IOException("Apple gave no refresh token");
        post("/auth/revoke", Map.of("client_id", bundleId, "client_secret", secret, "token", refresh, "token_type_hint", "refresh_token"));
    }

    /** Who is asking: a short-lived token signed with the Sign in with Apple key. */
    String clientSecret(Instant now) throws JOSEException {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(), new JWTClaimsSet.Builder()
                .issuer(teamId)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(SECRET_LIFETIME)))
                .audience(AUDIENCE)
                .subject(bundleId)
                .build());
        jwt.sign(new ECDSASigner(key));
        return jwt.serialize();
    }

    private String post(String path, Map<String, String> form) throws IOException, InterruptedException {
        String body = form.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IOException("Apple " + path + " answered " + response.statusCode());
        return response.body();
    }

    /** The .p8 file's contents, with real line breaks or with "\n" (environment variables often flatten them). */
    private static ECPrivateKey parseKey(String pem) {
        String base64 = pem.replace("\\n", "\n").replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalArgumentException("APPLE_PRIVATE_KEY is not a valid .p8 key", e);
        }
    }
}
