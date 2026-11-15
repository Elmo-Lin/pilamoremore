package com.example.backend.push;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Date;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Web Push (RFC 8030): VAPID-signed (RFC 8292), aes128gcm-encrypted (RFC 8291) messages, built from
 * the JDK and Nimbus (already here for sign-in tokens). A browser subscription is an endpoint on its
 * push service (Apple, Google, Mozilla…) plus the device's public key and auth secret; the push
 * service relays the encrypted message to the device, which shows it as a notification.
 * Keys are raw base64url (65-byte public point, 32-byte private scalar); empty = push off.
 */
@Component
public class WebPush {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ECParameterSpec P256 = p256();
    /** Record size advertised in the aes128gcm header; the whole message fits in one record. */
    private static final int RECORD_SIZE = 4096;

    private final ECPrivateKey privateKey;
    private final String publicKey;
    private final String subject;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public WebPush(@Value("${pila.push.public-key:}") String publicKey, @Value("${pila.push.private-key:}") String privateKey,
            @Value("${pila.push.subject:${pila.app-url}}") String subject) {
        this.publicKey = publicKey.trim();
        this.privateKey = privateKey.isBlank() ? null : privateKey(decode(privateKey.trim()));
        this.subject = subject;
    }

    public boolean enabled() {
        return privateKey != null && !publicKey.isEmpty();
    }

    /** The VAPID public key browsers subscribe with ({@code applicationServerKey}). */
    public String publicKey() {
        return publicKey;
    }

    /** Sends one message and returns the push service's HTTP status (404/410: the subscription is gone). */
    public int send(String endpoint, String p256dh, String auth, byte[] payload) throws Exception {
        byte[] body = encrypt(payload, decode(p256dh), decode(auth));
        HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/octet-stream")
                .header("Content-Encoding", "aes128gcm")
                .header("TTL", String.valueOf(Duration.ofDays(1).toSeconds()))
                .header("Urgency", "normal")
                .header("Authorization", "vapid t=" + vapidToken(endpoint) + ", k=" + publicKey)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        return http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    /** Proves to the push service that the message comes from the holder of our key (RFC 8292). */
    String vapidToken(String endpoint) throws JOSEException {
        URI u = URI.create(endpoint);
        String audience = u.getScheme() + "://" + u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .audience(audience)
                .expirationTime(Date.from(Instant.now().plus(Duration.ofHours(12))))
                .subject(subject)
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).type(JOSEObjectType.JWT).build(), claims);
        jwt.sign(new ECDSASigner(privateKey));
        return jwt.serialize();
    }

    /** RFC 8291: only the device holding the subscription's private key can read the message. */
    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret) throws GeneralSecurityException {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair as = gen.generateKeyPair();
        byte[] asPublic = encodePoint((ECPublicKey) as.getPublic());
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] ikm = hkdf(authSecret, ecdh(as, uaPublic), concat(ascii("WebPush: info\0"), uaPublic, asPublic), 32);
        byte[] cek = hkdf(salt, ikm, ascii("Content-Encoding: aes128gcm\0"), 16);
        byte[] nonce = hkdf(salt, ikm, ascii("Content-Encoding: nonce\0"), 12);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[] {2})); // 0x02: last (only) record
        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
        return concat(header.array(), ciphertext);
    }

    static byte[] ecdh(KeyPair ours, byte[] theirPublic) throws GeneralSecurityException {
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(ours.getPrivate());
        agreement.doPhase(publicKey(theirPublic), true);
        return agreement.generateSecret();
    }

    /** HKDF-SHA256 (RFC 5869), for outputs of at most one hash block. */
    static byte[] hkdf(byte[] salt, byte[] ikm, byte[] info, int length) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        return Arrays.copyOf(mac.doFinal(), length);
    }

    static byte[] encodePoint(ECPublicKey key) {
        return concat(new byte[] {4}, unsigned32(key.getW().getAffineX()), unsigned32(key.getW().getAffineY()));
    }

    static ECPublicKey publicKey(byte[] point) throws GeneralSecurityException {
        if (point.length != 65 || point[0] != 4) throw new GeneralSecurityException("not an uncompressed P-256 point");
        ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(point, 1, 33)), new BigInteger(1, Arrays.copyOfRange(point, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, P256));
    }

    static ECPrivateKey privateKey(byte[] scalar) {
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("pila.push.private-key is not a P-256 key", e);
        }
    }

    static byte[] decode(String base64url) {
        return Base64.getUrlDecoder().decode(base64url.replace('+', '-').replace('/', '_').replace("=", ""));
    }

    private static byte[] unsigned32(BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length == 32) return b;
        byte[] out = new byte[32];
        int n = Math.min(b.length, 32);
        System.arraycopy(b, b.length - n, out, 32 - n, n);
        return out;
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        ByteBuffer out = ByteBuffer.allocate(n);
        for (byte[] p : parts) out.put(p);
        return out.array();
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1"));
            return params.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
