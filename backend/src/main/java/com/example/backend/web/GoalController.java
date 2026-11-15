package com.example.backend.web;

import com.example.backend.auth.CurrentUser;
import com.example.backend.service.GoalService;
import com.example.backend.web.Dtos.GoalDto;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/goals")
public class GoalController {

    private final GoalService goals;

    public GoalController(GoalService goals) {
        this.goals = goals;
    }

    /** Create-or-replace with a client-chosen ID. */
    @PutMapping("/{id}")
    public GoalDto save(CurrentUser user, @PathVariable String id, @Valid @RequestBody GoalDto in) {
        return goals.save(user, id, in);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(CurrentUser user, @PathVariable String id) {
        goals.delete(user, id);
    }
}
