package com.example.backend.web;

import com.example.backend.admin.AdminService;
import com.example.backend.auth.CurrentUser;
import com.example.backend.web.Dtos.AdminOverviewDto;
import com.example.backend.web.Dtos.AdminStatusDto;
import com.example.backend.web.Dtos.AdminUserDto;
import com.example.backend.web.Dtos.ComplimentaryInput;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The service owner's page (see AdminService). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    /** Whether to show the way in; anyone signed in may ask. */
    @GetMapping("/status")
    public AdminStatusDto status(CurrentUser user) {
        return new AdminStatusDto(admin.isAdmin(user));
    }

    @GetMapping("/overview")
    public AdminOverviewDto overview(CurrentUser user) {
        return admin.overview(user);
    }

    @GetMapping("/users")
    public List<AdminUserDto> users(CurrentUser user) {
        return admin.users(user);
    }

    @PutMapping("/workspaces/{id}/complimentary")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setComplimentary(CurrentUser user, @PathVariable String id, @Valid @RequestBody ComplimentaryInput in) {
        admin.setComplimentary(user, id, in.extraStudentPacks(), in.extraCoachSeats());
    }

    @DeleteMapping("/workspaces/{id}/complimentary")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeComplimentary(CurrentUser user, @PathVariable String id) {
        admin.revokeComplimentary(user, id);
    }
}
