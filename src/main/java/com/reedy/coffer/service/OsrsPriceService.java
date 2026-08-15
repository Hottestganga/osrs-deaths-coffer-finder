package com.reedy.coffer.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reedy.coffer.model.CofferOpportunity;
import com.reedy.coffer.model.CofferScanResult;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class OsrsPriceService {
    private static final String WIKI_BASE = "https://prices.runescape.wiki/api/v1/osrs";
    private static final String RUNELITE_BOOTSTRAP = "https://static.runelite.net/bootstrap.json";
    private static final String RUNELITE_API_PREFIX = "https://api.runelite.net/runelite-";
    private static final String USER_AGENT = "osrs-deaths-coffer-finder/5.0 (community Death's Coffer comparison tool)";
    private static final Duration RESULT_TTL = Duration.ofSeconds(60);
    private static final Pattern CLIENT_VERSION = Pattern.compile("^client-([0-9.]+)\\.jar$");

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private volatile CofferScanResult resultCache;
    private volatile Instant resultCacheTime = Instant.EPOCH;

    public CofferOpportunity getItem(int id, boolean forceRefresh) throws Exception {
        return getScan(forceRefresh).opportunities().stream()
                .filter(item -> item.id() == id)
                .findFirst()
                .orElse(null);
    }

    public synchronized CofferScanResult getScan(boolean forceRefresh) throws Exception {
        if (!forceRefresh && resultCache != null
                && resultCacheTime.isAfter(Instant.now().minus(RESULT_TTL))) {
            return resultCache;
        }

        JsonNode mapping = getJson(WIKI_BASE + "/mapping");
        JsonNode latest = getJson(WIKI_BASE + "/latest").path("data");
        JsonNode oneHour = getJson(WIKI_BASE + "/1h").path("data");

        String runeliteVersion = discoverRuneLiteVersion();
        JsonNode runeLitePrices = getJson(RUNELITE_API_PREFIX + runeliteVersion + "/item/prices.js");

        Map<Integer, OfficialPrice> officialPrices = parseRuneLiteOfficialPrices(runeLitePrices);
        if (officialPrices.isEmpty()) {
            throw new IOException("RuneLite returned no official GE prices. Try Refresh again in a moment.");
        }

        int mappedItems = 0;
        int livePricedItems = 0;
        int officialPricedItems = 0;
        int cofferEligibleItems = 0;
        List<CofferOpportunity> result = new ArrayList<>();

        for (JsonNode item : mapping) {
            mappedItems++;

            int id = item.path("id").asInt();
            String name = item.path("name").asText("Unknown");
            String icon = item.path("icon").asText("");
            boolean members = item.path("members").asBoolean(false);
            Integer buyLimit = item.hasNonNull("limit") ? item.path("limit").asInt() : null;

            JsonNode live = latest.path(String.valueOf(id));
            long high = live.path("high").asLong(0);
            long low = live.path("low").asLong(0);
            long highTime = live.path("highTime").asLong(0);

            if (high <= 0 && low <= 0) {
                continue;
            }
            livePricedItems++;

            OfficialPrice official = officialPrices.get(id);
            if (official == null || official.price() <= 0) {
                continue;
            }
            officialPricedItems++;

            long guide = official.price();
            if (guide < 10_000) {
                continue;
            }
            cofferEligibleItems++;

            long liveBuy = high > 0 ? high : low;
            long coffer = Math.round(guide * 1.05d);
            long saving = coffer - liveBuy;
            if (saving <= 0) {
                continue;
            }

            JsonNode hour = oneHour.path(String.valueOf(id));
            long highVolume = hour.path("highPriceVolume").asLong(0);
            long lowVolume = hour.path("lowPriceVolume").asLong(0);
            long totalVolume = safeAdd(highVolume, lowVolume);

            double savingPct = (saving * 100.0) / liveBuy;
            double multiplier = (double) coffer / liveBuy;
            long potential = buyLimit == null ? 0 : safeMultiply(saving, buyLimit);
            String liquidity = liquidity(totalVolume);
            double practicalScore = practicalScore(savingPct, totalVolume, buyLimit, potential);
            String confidence = confidence(totalVolume, buyLimit, highTime);

            result.add(new CofferOpportunity(
                    id, name, icon, members, buyLimit,
                    guide, coffer, liveBuy, low, saving, savingPct, multiplier,
                    highVolume, lowVolume, totalVolume, potential, liquidity,
                    practicalScore, confidence, highTime, official.updatedEpochSeconds()
            ));
        }

        result.sort(Comparator.comparingDouble(CofferOpportunity::practicalScore).reversed());

        resultCache = new CofferScanResult(
                mappedItems,
                livePricedItems,
                officialPricedItems,
                cofferEligibleItems,
                result.size(),
                "RuneLite bulk Jagex GE snapshot",
                runeliteVersion,
                Instant.now().getEpochSecond(),
                List.copyOf(result)
        );
        resultCacheTime = Instant.now();

        System.out.printf(
                Locale.ROOT,
                "V5 scan: %,d mapped, %,d live, %,d official, %,d coffer eligible, %,d profitable.%n",
                mappedItems, livePricedItems, officialPricedItems, cofferEligibleItems, result.size()
        );

        return resultCache;
    }

    private String discoverRuneLiteVersion() throws Exception {
        JsonNode bootstrap = getJson(RUNELITE_BOOTSTRAP);
        JsonNode artifacts = bootstrap.path("artifacts");
        if (!artifacts.isArray()) {
            throw new IOException("Could not discover current RuneLite version.");
        }

        for (JsonNode artifact : artifacts) {
            String name = artifact.path("name").asText("");
            Matcher matcher = CLIENT_VERSION.matcher(name);
            if (matcher.matches()) {
                return matcher.group(1);
            }
        }

        throw new IOException("Could not find RuneLite client version in bootstrap.json.");
    }

    private Map<Integer, OfficialPrice> parseRuneLiteOfficialPrices(JsonNode root) {
        Map<Integer, OfficialPrice> prices = new HashMap<>();
        long now = Instant.now().getEpochSecond();

        JsonNode array = root;
        if (root.isObject()) {
            if (root.path("prices").isArray()) array = root.path("prices");
            else if (root.path("data").isArray()) array = root.path("data");
        }

        if (!array.isArray()) return prices;

        for (JsonNode node : array) {
            int id = node.path("id").asInt(0);
            long price = node.path("price").asLong(0);
            if (id <= 0 || price <= 0) continue;

            long updated = firstPositive(
                    node.path("time").asLong(0),
                    node.path("timestamp").asLong(0),
                    node.path("priceTime").asLong(0),
                    now
            );
            prices.put(id, new OfficialPrice(price, updated));
        }
        return prices;
    }

    private JsonNode getJson(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(25))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("HTTP " + response.statusCode() + " from " + url);
        }
        return mapper.readTree(response.body());
    }

    private static String liquidity(long volume) {
        if (volume >= 5_000) return "Very high";
        if (volume >= 1_000) return "High";
        if (volume >= 250) return "Medium";
        if (volume >= 50) return "Low";
        return "Very low";
    }

    private static String confidence(long volume, Integer buyLimit, long highTimestamp) {
        int points = 0;
        if (volume >= 5_000) points += 4;
        else if (volume >= 1_000) points += 3;
        else if (volume >= 250) points += 2;
        else if (volume >= 50) points += 1;

        if (buyLimit != null && buyLimit >= 1_000) points += 2;
        else if (buyLimit != null && buyLimit >= 50) points += 1;

        if (highTimestamp > 0 && highTimestamp >= Instant.now().minus(Duration.ofMinutes(30)).getEpochSecond()) {
            points += 1;
        }

        return switch (points) {
            case 7, 6 -> "Excellent";
            case 5 -> "High";
            case 4 -> "Good";
            case 3 -> "Fair";
            default -> "Low";
        };
    }

    private static double practicalScore(double savingPct, long volume, Integer buyLimit, long potentialSaving) {
        double volumeFactor = Math.min(1.0, Math.log10(volume + 1) / 4.7);
        double limitFactor = buyLimit == null ? 0.10 : Math.min(1.0, Math.log10(buyLimit + 1) / 4.7);
        double potentialFactor = Math.min(1.0, Math.log10(Math.max(1, potentialSaving)) / 9.0);
        double reliability = 0.30 + (0.40 * volumeFactor) + (0.15 * limitFactor) + (0.15 * potentialFactor);
        return savingPct * reliability;
    }

    private static long safeMultiply(long a, long b) {
        try {
            return Math.multiplyExact(a, b);
        } catch (ArithmeticException e) {
            return Long.MAX_VALUE;
        }
    }

    private static long safeAdd(long a, long b) {
        try {
            return Math.addExact(a, b);
        } catch (ArithmeticException e) {
            return Long.MAX_VALUE;
        }
    }

    private static long firstPositive(long... values) {
        for (long value : values) if (value > 0) return value;
        return 0;
    }

    private record OfficialPrice(long price, long updatedEpochSeconds) {}
}
