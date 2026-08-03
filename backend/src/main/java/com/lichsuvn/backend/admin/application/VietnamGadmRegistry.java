package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Immutable, backend-owned allowlist for the geography editor. */
@Component
public final class VietnamGadmRegistry {
    private final Map<String, String> labels;

    public VietnamGadmRegistry(ObjectMapper mapper) {
        try {
            List<Entry> entries = mapper.readValue(
                    new ClassPathResource("geography/vietnam-gadm-registry.json").getInputStream(),
                    new TypeReference<>() {});
            LinkedHashMap<String, String> values = new LinkedHashMap<>();
            for (Entry entry : entries) {
                if (entry.gadmRef() == null || entry.gadmRef().isBlank()
                        || entry.label() == null || entry.label().isBlank()
                        || values.put(entry.gadmRef(), entry.label()) != null) {
                    throw new IllegalStateException("Invalid duplicate geography registry entry");
                }
            }
            labels = Map.copyOf(values);
        } catch (IOException ex) {
            throw new IllegalStateException("Cannot load backend geography registry", ex);
        }
    }

    public String label(String gadmRef) {
        return labels.get(gadmRef);
    }

    public boolean contains(String gadmRef) {
        return labels.containsKey(gadmRef);
    }

    public Map<String, String> labels() {
        return labels;
    }

    private record Entry(String gadmRef, String label) {
    }
}
