package com.example.backend.push;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/** The device side of RFC 8291 decrypts what {@link WebPush} sends; the VAPID token verifies with our public key. */
class WebPushTest {

    static KeyPair p256() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        return gen.generateKeyPair();
    }

    static String b64(byte[] b) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    @Test
    void onlyTheSubscribedDeviceCanReadTheMessage() throws Exception {
        KeyPair device = p256();
        byte[] devicePublic = WebPush.encodePoint((ECPublicKey) device.getPublic());
        byte[] auth = new byte[16];
        new SecureRandom().nextBytes(auth);
        byte[] message = "{\"title\":\"明天有課\"}".getBytes(StandardCharsets.UTF_8);

        ByteBuffer body = ByteBuffer.wrap(WebPush.encrypt(message, devicePublic, auth));
        byte[] salt = new byte[16];
        body.get(salt);
        assertThat(body.getInt()).as("record size").isEqualTo(4096);
        byte[] serverPublic = new byte[body.get()];
        body.get(serverPublic);
        byte[] ciphertext = new byte[body.remaining()];
        body.get(ciphertext);

        byte[] ikm = WebPush.hkdf(auth, WebPush.ecdh(device, serverPublic),
                WebPush.concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), devicePublic, serverPublic), 32);
        byte[] cek = WebPush.hkdf(salt, ikm, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = WebPush.hkdf(salt, ikm, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] plain = cipher.doFinal(ciphertext);

        assertThat(plain[plain.length - 1]).as("last-record delimiter").isEqualTo((byte) 2);
        assertThat(Arrays.copyOf(plain, plain.length - 1)).isEqualTo(message);
    }

    @Test
    void theVapidTokenIsSignedForThePushService() throws Exception {
        KeyPair server = p256();
        byte[] d = ((ECPrivateKey) server.getPrivate()).getS().toByteArray();
        byte[] scalar = Arrays.copyOfRange(d, Math.max(0, d.length - 32), d.length);
        WebPush push = new WebPush(b64(WebPush.encodePoint((ECPublicKey) server.getPublic())), b64(scalar), "https://pilamoremore.com");
        assertThat(push.enabled()).isTrue();

        SignedJWT jwt = SignedJWT.parse(push.vapidToken("https://web.push.apple.com/QGuQyavXutnMH"));
        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) server.getPublic()))).isTrue();
        assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly("https://web.push.apple.com");
        assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("https://pilamoremore.com");
    }
}
