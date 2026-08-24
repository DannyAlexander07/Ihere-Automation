INSERT INTO "Permission" ("id", "code", "description")
VALUES (
  gen_random_uuid(),
  'clients.delete',
  'Eliminar clientes editoriales sin historial'
)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'clients.delete'
WHERE role."code" = 'administrator'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
