-- Sprache des Anschreibens und der E-Mail-Bewerbung je Bewerbung ('de' | 'tr'); NULL = automatisch (Türkisch bei türkischer Ansicht und türkischer Stelle oder türkischem Lebenslauf)
ALTER TABLE applications ADD COLUMN letter_lang text;
