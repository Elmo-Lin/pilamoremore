package com.example.backend.web;

import com.example.backend.auth.CurrentUser;
import com.example.backend.service.AccountService;
import com.example.backend.service.BillingService;
import com.example.backend.web.Dtos.AccountDeletionDto;
import com.example.backend.web.Dtos.AppleRevocationInput;
import com.example.backend.web.Dtos.PackagePresetDto;
import com.example.backend.web.Dtos.PackagePresetsInput;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in coach's own settings. They are read back through {@code GET /bootstrap} ({@code coach}). */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final BillingService billing;
    private final AccountService accounts;

    public MeController(BillingService billing, AccountService accounts) {
        this.billing = billing;
        this.accounts = accounts;
    }

    /** Deletes the signed-in account (see {@link AccountService}). */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount(CurrentUser user) {
        accounts.delete(user);
    }

    @GetMapping("/deletion")
    public AccountDeletionDto deletion(CurrentUser user) {
        return new AccountDeletionDto(accounts.needsAppleRevocation(user));
    }

    /** Called just before deleting an account that signs in with Apple. */
    @PostMapping("/apple-revocation")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeApple(CurrentUser user, @Valid @RequestBody AppleRevocationInput in) {
        accounts.revokeApple(user, in.identityToken(), in.authorizationCode());
    }

    @PutMapping("/package-presets")
    public List<PackagePresetDto> packagePresets(CurrentUser user, @Valid @RequestBody PackagePresetsInput in) {
        return billing.savePresets(user, in.presets());
    }
}
