package {{package}}.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Answers {@code GET /health} while the app is running.
 */
@RestController
public class HealthController {

    private static final Health UP = new Health("UP");

    @GetMapping("/health")
    public Health health() {
        return UP;
    }
}
