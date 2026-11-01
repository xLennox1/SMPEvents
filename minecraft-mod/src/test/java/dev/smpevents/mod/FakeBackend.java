package dev.smpevents.mod;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/** Lokaler Test-Server: beantwortet Aufrufe der Reihe nach mit den angegebenen Statuscodes (der letzte gilt dauerhaft). */
public final class FakeBackend implements AutoCloseable {
    public final AtomicInteger calls = new AtomicInteger();
    public final List<String> bodies = new CopyOnWriteArrayList<>();
    public final List<String> authHeaders = new CopyOnWriteArrayList<>();
    private final HttpServer server;

    public FakeBackend(int... statuses) throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/hook", ex -> {
            int n = calls.getAndIncrement();
            bodies.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authHeaders.add(ex.getRequestHeaders().getFirst("Authorization"));
            int status = statuses[Math.min(n, statuses.length - 1)];
            if (status == 302) {
                ex.getResponseHeaders().add("Location", "http://127.0.0.1:1/elsewhere");
            }
            ex.sendResponseHeaders(status, -1);
            ex.close();
        });
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
