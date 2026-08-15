package com.reedy.coffer.controller;

import com.reedy.coffer.model.CofferScanResult;
import com.reedy.coffer.service.OsrsPriceService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;
import com.reedy.coffer.model.CofferOpportunity;

@RestController
@RequestMapping("/api")
public class CofferController {
    private final OsrsPriceService service;

    public CofferController(OsrsPriceService service) {
        this.service = service;
    }

    @GetMapping("/coffer")
    public ResponseEntity<CofferScanResult> coffer(
            @RequestParam(defaultValue = "false") boolean refresh
    ) throws Exception {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(15, TimeUnit.SECONDS).cachePublic())
                .body(service.getScan(refresh));
    }
    @GetMapping("/item/{id}")
    public ResponseEntity<CofferOpportunity> item(
            @PathVariable int id,
            @RequestParam(defaultValue = "false") boolean refresh
    ) throws Exception {
        CofferOpportunity item = service.getItem(id, refresh);
        if (item == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(15, TimeUnit.SECONDS).cachePublic())
                .body(item);
    }

}
