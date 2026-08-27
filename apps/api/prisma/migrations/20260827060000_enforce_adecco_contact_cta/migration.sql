UPDATE "NoteVersion" AS version
SET
  "ctaText" = CASE
    WHEN BTRIM(COALESCE(version."ctaText", '')) = '' THEN
      '¿Quieres evaluar la mejor alternativa para tu organización? Contacta a un especialista de Adecco.'
    WHEN LOWER(version."ctaText") LIKE '%contacta%'
      AND LOWER(version."ctaText") LIKE '%especialista%' THEN
      BTRIM(version."ctaText")
    ELSE
      REGEXP_REPLACE(BTRIM(version."ctaText"), '[.!?]+$', '') || '. Contacta a un especialista de Adecco.'
  END,
  "ctaUrl" = 'https://www.adecco.com/es-pe/contactanos'
FROM "NoteDocument" AS note
INNER JOIN "Client" AS client ON client.id = note."clientId"
WHERE version."noteId" = note.id
  AND client.slug = 'adecco-peru';
