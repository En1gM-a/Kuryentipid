import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SECRET_KEY
);

const MONTH = 6;
const YEAR = 2026;

const raw = fs.readFileSync("./scripts/june2026.json", "utf8");
const json = JSON.parse(raw);

// THIS IS THE REAL DATA
const providers = json.tables.all;

console.log(`Found ${providers.length} providers`);

function makeSlug(name) {
    return name
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

for (const row of providers) {

    const acronym = row["Distribution Utility"];
    const fullName = row["DU Full Name"];

    const province = row["Province"];
    const gridType = row["Grid Classification"];

    const residentialRate = Number(
        row["Residential Electricity Rate (PHP/kWh)"]
    );

    // Look for existing provider
    let { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("acronym", acronym)
        .maybeSingle();

    if (!provider) {

        const { data: inserted, error } = await supabase
            .from("providers")
            .insert({
                name: fullName,
                acronym: acronym,
                slug: makeSlug(acronym),
                province: province,
                grid_type: gridType
            })
            .select()
            .single();

        if (error) {
            console.error(error);
            continue;
        }

        provider = inserted;
    }

    const { error } = await supabase
        .from("electricity_rates")
        .upsert({
            provider_id: provider.id,
            month: MONTH,
            year: YEAR,
            residential_rate: residentialRate,
            source_url: process.env.API_URL_ELECTRICITY_PROV
        });

    if (error) {
        console.error(acronym, error.message);
    } else {
        console.log(`✔ ${acronym} - ₱${residentialRate}`);
    }
}

console.log("================================");
console.log("Finished importing all providers.");