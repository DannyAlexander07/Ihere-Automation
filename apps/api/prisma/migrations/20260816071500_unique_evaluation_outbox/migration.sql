CREATE UNIQUE INDEX "OutboxJob_jobType_aggregateType_aggregateId_key"
ON "OutboxJob"("jobType", "aggregateType", "aggregateId");
