package dev.smpevents.mod;

import dev.smpevents.mod.config.ModConfig;
import java.nio.file.Path;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client-Einstieg. Liest nur Chat-/Systemnachrichten, die der Client ohnehin erhält. Die Mod greift weder auf
 * Zugangsdaten oder Session-Tokens zu, noch sendet sie Pakete, noch verändert sie Spielverhalten.
 */
public final class SMPEventsClient implements ClientModInitializer {
    public static final String MOD_ID = "smpevents";
    private static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitializeClient() {
        Path configDir = FabricLoader.getInstance().getConfigDir();
        ModConfig config = ModConfig.loadOrCreate(configDir.resolve("smpevents.json"), LOG);
        String version = FabricLoader.getInstance().getModContainer(MOD_ID)
                .map(c -> c.getMetadata().getVersion().getFriendlyString())
                .orElse("dev");
        ChatHandler handler = new ChatHandler(config, configDir, version, LOG);

        // Serverseitige Systemnachrichten (z. B. Überweisungsmeldungen von Plugins); Action-Bar (overlay) ignorieren
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            if (!overlay) {
                handler.onMessage(message.getString());
            }
        });
        // Spielerchat
        ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, receptionTimestamp) ->
                handler.onMessage(message.getString()));
    }
}
