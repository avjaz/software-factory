package {{package}}.health;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.equalTo;

class HealthControllerTest {

    private HealthController controller;

    @BeforeEach
    void setUp() {
        controller = new HealthController();
    }

    @Test
    void Can_report_up_when_the_app_is_running() {
        // When
        final Health actual = controller.health();

        // Then
        assertThat(actual.status(), equalTo("UP"));
    }
}
