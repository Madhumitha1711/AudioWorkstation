# Deploying AudioWorkStation to AWS

Stack: `studio-backend` (NestJS API), `studio-cms` (Strapi), `studio-vr` (Vite/React frontend), one shared AWS RDS Postgres instance.

## What was verified

Both `studio-backend/Dockerfile` and `studio-cms/Dockerfile` were test-built against the real source in this repo (`npm ci` + the project's own build script), confirming the multi-stage layout actually compiles and the runtime stage has everything it needs. One thing that surfaced during that test: Strapi defaults to **sqlite** unless `DATABASE_CLIENT=postgres` is set explicitly — this repo's `studio-cms/.env.example` already sets it correctly, so just make sure that variable rides along wherever you set the others.

`studio-vr` isn't containerized — it's a static Vite build deployed straight to an S3 static website hosting bucket (see step 5). No CloudFront in front of it for now; that can be added later.

## 1. Push images to ECR

```bash
aws ecr create-repository --repository-name studio-backend
aws ecr create-repository --repository-name studio-cms

aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 654740195946.dkr.ecr.ap-south-1.amazonaws.com

docker build --provenance=false --sbom=false -t studio-backend ./studio-backend
docker tag studio-backend:latest 654740195946.dkr.ecr.ap-south-1.amazonaws.com/studio-backend:latest
docker push 654740195946.dkr.ecr.ap-south-1.amazonaws.com/studio-backend:latest

docker build --provenance=false --sbom=false -t studio-cms ./studio-cms
docker tag studio-cms:latest 654740195946.dkr.ecr.ap-south-1.amazonaws.com/studio-cms:latest
docker push 654740195946.dkr.ecr.ap-south-1.amazonaws.com/studio-cms:latest
```

## 2. Database (RDS)

One `db.t4g.micro` Postgres instance holds both apps' data as two separate databases (`studio-db` for the backend, `studio-cms` for the CMS) — cheaper than two instances. Create the second database once the instance is up:

```bash
psql "host=<RDS_ENDPOINT> port=5432 user=<MASTER_USERNAME> dbname=postgres sslmode=require" -c 'CREATE DATABASE "studio-cms";'
```

Enable `DATABASE_SSL=true` in both apps' env once RDS is up, and lock the RDS security group down to just the ECS tasks' security group (no public access needed).

## 3. Secrets (SSM Parameter Store)

Yes — push every secret-ish value (API keys, DB credentials, signing keys, tokens) into Parameter Store rather than baking them into the task definitions. It's free for standard-tier parameters, and both task defs in `ecs/` already reference them under `secrets` with the exact paths below.

Two scripts do this for you, reading straight from your real `.env` files so you never retype a secret by hand:

```bash
cd scripts
./push-backend-secrets-to-ssm.sh   # reads ../studio-backend/.env
./push-cms-secrets-to-ssm.sh       # reads ../studio-cms/.env
```

Each pushes exactly the keys its task def expects, as `SecureString`, under `/studio/dev/<NAME>` (both scripts skip and warn on any value that's empty locally, instead of pushing a blank secret that would silently disable that feature at runtime). Re-run either script any time a value changes — it overwrites in place. A few plain, non-secret values (ports, cache durations, `PAYMENT_GATEWAY`, the price, etc.) are left directly in the task defs' `environment` block instead, since there's no benefit to hiding them in SSM.

One naming note: both apps have a variable called `AWS_ACCESS_KEY_ID` in their own `.env`, and the CMS also uses `AWS_ACCESS_SECRET` where the backend uses `AWS_SECRET_ACCESS_KEY` for the same kind of value — so the SSM parameter names are prefixed (`BACKEND_AWS_ACCESS_KEY_ID` / `CMS_AWS_ACCESS_KEY_ID`, etc.) to keep the two separate in Parameter Store, even though each container still receives it under its own expected env var name.

## 4. ECS Fargate

```bash
aws ecs register-task-definition --cli-input-json file://ecs/studio-backend-task-def.json --region ap-south-1
aws ecs register-task-definition --cli-input-json file://ecs/studio-cms-task-def.json --region ap-south-1

# then create services (one-time), pointing at a VPC/subnets/security group
# and, for studio-backend, an ALB target group on port 3000:
aws ecs create-service --cluster <CLUSTER> --service-name studio-backend \
  --task-definition studio-backend --desired-count 1 --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<SUBNET_IDS>],securityGroups=[<SG_ID>],assignPublicIp=ENABLED}"
```

Repeat for `studio-cms`. Keep `desiredCount` at 1 for both to start — scale via the service's auto-scaling policy once real traffic shows up, and consider a Fargate Spot capacity provider for further savings.

## 5. Frontend (studio-vr → S3 static website hosting)

No CloudFront for now — served directly off the S3 website endpoint to keep this simple. One-time setup:

1. Create an S3 bucket, then enable **Static website hosting** on it (Properties tab): index document `index.html`, error document `index.html` (so client-side routing doesn't 404 on refresh/deep links).
2. Turn **off** Block Public Access for this bucket — a website-hosting bucket has to allow public reads.
3. Apply `studio-vr/s3-bucket-policy.json` to the bucket (fill in `<YOUR_FRONTEND_BUCKET>`) — this is what actually makes the objects publicly readable.
4. Note the bucket's website endpoint URL (Properties tab, e.g. `http://<bucket>.s3-website-<region>.amazonaws.com`) — that's what you'll open in a browser or point a domain at.

Then, every deploy:

```bash
cd studio-vr
S3_BUCKET=<YOUR_FRONTEND_BUCKET> ./deploy.sh
```

`deploy.sh` builds, syncs hashed assets with a long immutable cache, and syncs `index.html` with no-cache so a new deploy shows up immediately. Cost here is just S3 storage + request charges — a few cents a month for a site this size. When you're ready for HTTPS and edge caching, add a CloudFront distribution in front of this bucket (switch the bucket back to private + Origin Access Control at that point, since the website-endpoint + public-bucket setup here is the simple/no-CDN path).

## 6. Local dry run before any of this

```bash
docker compose up --build
```

Spins up all three services together (no local Postgres — both apps connect straight to your RDS instance using the `DATABASE_HOST`/credentials already in their `.env` files) so you can sanity-check the images before pushing to ECR. Make sure the RDS security group allows inbound access from wherever you run this — your machine's IP, or a bastion/VPN into the VPC.
