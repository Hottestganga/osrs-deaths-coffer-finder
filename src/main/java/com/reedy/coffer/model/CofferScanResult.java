package com.reedy.coffer.model;

import java.util.List;

public record CofferScanResult(
        int mappedItems,
        int livePricedItems,
        int officialPricedItems,
        int cofferEligibleItems,
        int profitableItems,
        String officialPriceSource,
        String runeliteVersion,
        long scannedAtEpochSeconds,
        List<CofferOpportunity> opportunities
) {}
