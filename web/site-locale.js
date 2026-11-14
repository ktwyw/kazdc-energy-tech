"use strict";

window.SiteI18n = (() => {
  const data = {{LOCALE_DATA}};
  const cityName = (slug, fallback) => data.cities[slug] || fallback || slug;
  function formatNumber(value, options) {
    if (data.lang !== "kk") return value.toLocaleString(data.locale, options);
    // Some browsers ship a partial Kazakh locale and silently use English punctuation.
    return value.toLocaleString("en-US", options).replaceAll(",", "\u00a0").replace(".", ",");
  }
  function stationNote(station) {
    const location = station.location_note || "";
    let kind = "station";
    if (location.includes("ERA5")) kind = station.slug === "qonaev" ? "qonaev" : "era";
    else if (location.includes("International Airport")) kind = "internationalAirport";
    else if (location.includes("Airport")) kind = "airport";
    const place = data.lang === "en" && location ? location :
      data.station[kind].replace("{city}", cityName(station.slug, station.name));
    const origin = data.station.origin.replace("{location}", place)
      .replace("{years}", station.source_years).replace("{period}", station.period);
    const quality = station.slug === "almaty" && station.quality_note ? ". " + data.station.quality : "";
    return origin + quality;
  }
  return {lang: data.lang, locale: data.locale, months: data.months, shortMonths: data.shortMonths, cityName, stationNote, formatNumber};
})();
