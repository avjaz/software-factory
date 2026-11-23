package {{package}};

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noCodeUnits;

class ArchitectureTest {

    private static final String BASE = "{{package}}";

    // JaCoCo skips any class or method annotated with something named *Generated*, so such an annotation is a way
    // around the coverage gate. The house standard allows it only on logic-free value records and configuration.
    private static final DescribedPredicate<JavaAnnotation<?>> GENERATED = DescribedPredicate.describe(
        "an annotation named like Generated",
        annotation -> annotation.getRawType().getSimpleName().contains("Generated"));

    private static final ArchRule GENERATED_ONLY_ON_RECORDS_AND_CONFIGURATION = classes()
        .that().areAnnotatedWith(GENERATED)
        .should().beAssignableTo(Record.class)
        .orShould().haveSimpleNameEndingWith("Configuration")
        .allowEmptyShould(true);

    private static final ArchRule NO_GENERATED_METHODS_OR_CONSTRUCTORS = noCodeUnits()
        .should().beAnnotatedWith(GENERATED);

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(BASE);
    }

    @Test
    void Can_keep_generated_annotations_to_records_and_configuration_classes() {
        // Then
        GENERATED_ONLY_ON_RECORDS_AND_CONFIGURATION.check(classes);
    }

    @Test
    void Can_keep_generated_annotations_off_methods_and_constructors() {
        // Then
        NO_GENERATED_METHODS_OR_CONSTRUCTORS.check(classes);
    }
}
