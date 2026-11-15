package com.example.backend.auth;

import com.example.backend.common.ApiException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

/**
 * Verifies a Sign in with Apple identity token from the iOS app: Apple's signature, issuer, expiry,
 * and that it was issued for our app. The email may be missing after the first sign-in, or be one of
 * Apple's private relay addresses.
 */
@Component
public class AppleTokenVerifier {

    private static final String ISSUER = "https://appleid.apple.com";

    public record AppleUser(String sub, String email) {}

    private final String bundleId;
    private volatile JwtDecoder decoder;

    public AppleTokenVerifier(@Value("${pila.apple.bundle-id}") String bundleId) {
        this.bundleId = bundleId;
    }

    public AppleUser verify(String identityToken) {
        Jwt jwt;
        try {
            jwt = decoder().decode(identityToken);
        } catch (JwtException e) {
            throw ApiException.unauthorized("Apple 登入驗證失敗，請再試一次");
        }
        return new AppleUser(jwt.getSubject(), jwt.getClaimAsString("email"));
    }

    private JwtDecoder decoder() {
        if (decoder == null) {
            NimbusJwtDecoder d = NimbusJwtDecoder.withJwkSetUri("https://appleid.apple.com/auth/keys").build();
            d.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefault(),
                    new JwtClaimValidator<String>("iss", ISSUER::equals),
                    new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(bundleId))));
            decoder = d;
        }
        return decoder;
    }
}
