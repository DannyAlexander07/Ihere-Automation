-- Quality remains part of the note workflow, so note editors inherit the
-- permission that was previously isolated in the quality submodule.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'automation.notes'
  AND permission."code" = 'notes.qa'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- The retired role assignments are deleted by cascade. They are deliberately
-- not converted into Notes assignments because that would elevate users who
-- previously only had access to the quality queue.
DELETE FROM "Role"
WHERE "code" IN ('automation.quality', 'automation.quality.reader');
