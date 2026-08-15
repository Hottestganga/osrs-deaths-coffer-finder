package com.reedy.coffer.model;

public record CofferOpportunity(
        int id,
        String name,
        String icon,
        boolean members,
        Integer buyLimit,
        long officialGuidePrice,
        long cofferValue,
        long liveBuyPrice,
        long liveSellPrice,
        long savingPerItem,
        double savingPercent,
        double valueMultiplier,
        long oneHourBuyVolume,
        long oneHourSellVolume,
        long oneHourTotalVolume,
        long potentialSavingPerLimit,
        String liquidity,
        double practicalScore,
        String confidence,
        long liveBuyTimestamp,
        long officialPriceTimestamp
) {}
