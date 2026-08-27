-- Approval remains part of the title and note workflows. Full editors inherit
-- the decision and client-link permissions that were previously isolated in
-- a duplicate approvals submodule.
WITH role_permissions(role_code, permission_code) AS (
  VALUES
    ('automation.titles', 'titles.review'),
    ('automation.titles', 'titles.approve'),
    ('automation.titles', 'titles.publish'),
    ('automation.titles', 'review_links.manage'),
    ('automation.notes', 'notes.review'),
    ('automation.notes', 'notes.approve'),
    ('automation.notes', 'review_links.manage')
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN role_permissions mapping ON mapping.role_code = role."code"
JOIN "Permission" permission ON permission."code" = mapping.permission_code
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Assignments belonging only to the retired queue disappear by cascade. They
-- are deliberately not converted into editor access because doing so would
-- grant creation and editing capabilities that those users did not have.
DELETE FROM "Role"
WHERE "code" IN ('automation.approvals', 'automation.approvals.reader');
