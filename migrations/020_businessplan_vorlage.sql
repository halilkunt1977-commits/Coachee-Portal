-- Businessplan nach Halils Vorlage: 14 Kapitel statt 10 Abschnitte, „Auf einen Blick“, Quellen je Kapitel.
-- Die alten Texte wandern in die passenden neuen Kapitel; „Preise“ wird an „Marketing & Vertrieb“ angehängt.
-- Die bisherige Fassung bleibt zur Sicherheit in sections_v1 liegen.
ALTER TABLE business_plans ADD COLUMN sections_v1 jsonb;
ALTER TABLE business_plans ADD COLUMN glance jsonb NOT NULL DEFAULT '[]';
-- Woher ein übernommener Plan stammt: {"plan": {"document": …, "name": …, "at": …}, "finance": {…}}
ALTER TABLE business_plans ADD COLUMN imports jsonb NOT NULL DEFAULT '{}';

UPDATE business_plans
   SET sections_v1 = sections,
       sections = jsonb_strip_nulls(jsonb_build_object(
         'summary', sections->'zusammenfassung',
         'gruender', sections->'gruender',
         'idee', sections->'idee',
         'markt', sections->'markt',
         'wettbewerb', sections->'wettbewerb',
         'standort', sections->'standort',
         'organisation', sections->'organisation',
         'risiken', sections->'chancen',
         'marketing', CASE
           WHEN coalesce(sections->'preise'->>'text', '') ~ '\S' THEN
             coalesce(sections->'marketing', '{"version": 0}'::jsonb)
               || jsonb_build_object('text', btrim(coalesce(sections->'marketing'->>'text', '') || E'\n\n### Preise\n\n' || (sections->'preise'->>'text'), E' \n'))
           ELSE sections->'marketing'
         END
       ))
 WHERE sections ?| ARRAY['zusammenfassung', 'markt', 'preise', 'chancen'];
