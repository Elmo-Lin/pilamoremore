package com.example.backend.web;

import com.example.backend.auth.AuthService;
import com.example.backend.auth.CurrentUser;
import com.example.backend.auth.EmailVerificationService;
import com.example.backend.auth.PasswordResetService;
import com.example.backend.web.Dtos.ActivateInput;
import com.example.backend.web.Dtos.AppleAuthInput;
import com.example.backend.web.Dtos.AuthResponse;
import com.example.backend.web.Dtos.ForgotPasswordInput;
import com.example.backend.web.Dtos.GoogleAuthInput;
import com.example.backend.web.Dtos.LoginInput;
import com.example.backend.web.Dtos.MeDto;
import com.example.backend.web.Dtos.RegisterStudioInput;
import com.example.backend.web.Dtos.ResetPasswordInput;
import com.example.backend.web.Dtos.VerifyEmailInput;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService auth;
    private final PasswordResetService resets;
    private final EmailVerificationService verifications;

    public AuthController(AuthService auth, PasswordResetService resets, EmailVerificationService verifications) {
        this.auth = auth;
        this.resets = resets;
        this.verifications = verifications;
    }

    /** Signed in, and mailed the link that proves the email (until then the app shows only that). */
    private AuthResponse welcome(AuthResponse r) {
        if (!r.user().emailVerified()) verifications.send(r.user().userId());
        return r;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    /** Studio owner registration (the only sign-up): teachers and students join with invite codes. */
    @PostMapping("/auth/register-studio")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse registerStudio(@Valid @RequestBody RegisterStudioInput in) {
        return welcome(auth.registerStudio(in));
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody LoginInput in) {
        return auth.login(in);
    }

    /** Student sets a password with the invite code from their coach. */
    @PostMapping("/auth/activate")
    public AuthResponse activate(@Valid @RequestBody ActivateInput in) {
        return welcome(auth.activate(in));
    }

    /** Always 204, whether or not the email is registered. */
    @PostMapping("/auth/forgot-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void forgotPassword(@Valid @RequestBody ForgotPasswordInput in) {
        resets.request(in.email());
    }

    @PostMapping("/auth/reset-password")
    public AuthResponse resetPassword(@Valid @RequestBody ResetPasswordInput in) {
        return resets.reset(in.token(), in.password());
    }

    /** The link mailed after signing up: proves the email and signs in. */
    @PostMapping("/auth/verify-email")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailInput in) {
        return auth.issueFor(verifications.verify(in.token()));
    }

    /** Another verification link (at most one a minute); 204 either way. */
    @PostMapping("/auth/verify-email/resend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resendVerification(CurrentUser user) {
        verifications.send(user.userId());
    }

    /** A Google ID token or CSRF token: base64url segments joined by dots. */
    private static final Pattern GOOGLE_TOKEN = Pattern.compile("^[A-Za-z0-9._-]{1,4096}$");

    /**
     * Google's full-page sign-in (phones, where its popup cannot report back): Google posts the ID
     * token here as a form. It is handed back to the app in the URL fragment, which never reaches a
     * server; the app checks Google's CSRF token against the cookie Google set on the page and then
     * signs in through {@code /auth/google} as usual. The relative redirect returns to whichever
     * domain the user signed in from.
     */
    @PostMapping(value = "/auth/google/redirect", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> googleRedirect(@RequestParam(required = false) String credential,
            @RequestParam(name = "g_csrf_token", required = false) String csrf) {
        boolean ok = credential != null && csrf != null && GOOGLE_TOKEN.matcher(credential).matches() && GOOGLE_TOKEN.matcher(csrf).matches();
        String target = ok ? "/login#google=" + credential + "&csrf=" + csrf : "/login#google_error=1";
        return ResponseEntity.status(HttpStatus.SEE_OTHER).header(HttpHeaders.LOCATION, target).build();
    }

    @PostMapping("/auth/google")
    public AuthResponse google(@Valid @RequestBody GoogleAuthInput in) {
        return auth.google(in);
    }

    @PostMapping("/auth/apple")
    public AuthResponse apple(@Valid @RequestBody AppleAuthInput in) {
        return auth.apple(in);
    }

    /** A token for the caller's current role, e.g. after a paid upgrade made them a studio owner. */
    @PostMapping("/auth/refresh")
    public AuthResponse refresh(CurrentUser user) {
        return auth.refresh(user);
    }

    @GetMapping("/auth/me")
    public MeDto me(CurrentUser user) {
        return auth.me(user);
    }
}
