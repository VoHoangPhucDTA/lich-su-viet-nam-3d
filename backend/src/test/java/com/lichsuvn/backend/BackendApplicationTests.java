package com.lichsuvn.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:context;MODE=MySQL;DB_CLOSE_DELAY=-1",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.datasource.hikari.connection-init-sql=",
		"spring.flyway.enabled=false",
		"spring.jpa.hibernate.ddl-auto=none",
		"app.jwt.secret=test-only-secret-that-is-long-enough-for-hmac-signing"
})
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
