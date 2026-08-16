# ============================================================================
#  คำสั่งลัดสำหรับดูแลระบบ  (ใช้ `make help` เพื่อดูรายการทั้งหมด)
# ============================================================================
SHELL := /bin/bash
COMPOSE := docker compose

.DEFAULT_GOAL := help
.PHONY: help init up down restart logs ps build test lint smoke backup restore backup-drill monitoring monitoring-down clean

help: ## แสดงรายการคำสั่งทั้งหมด
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

init: ## สร้างไฟล์ .env พร้อมสุ่มรหัสผ่านอัตโนมัติ (ทำครั้งแรกครั้งเดียว)
	@sh ./ops/scripts/init-env.sh

up: ## ยกระบบขึ้น (build ใหม่ถ้าจำเป็น)
	$(COMPOSE) up -d --build
	@./ops/scripts/wait-for-healthy.sh 180

down: ## หยุดระบบ (ข้อมูลใน volume ยังอยู่)
	$(COMPOSE) down

restart: ## รีสตาร์ตทุกบริการ
	$(COMPOSE) restart

ps: ## ดูสถานะบริการ
	$(COMPOSE) ps

logs: ## ดู log แบบต่อเนื่อง (make logs S=backend เพื่อดูเฉพาะบริการ)
	$(COMPOSE) logs -f --tail=100 $(S)

build: ## build image ใหม่ทั้งหมด
	$(COMPOSE) build --no-cache

test: ## รันชุดทดสอบของ Back-end
	cd backend && npm test

lint: ## ตรวจคุณภาพโค้ดของ Back-end
	cd backend && npm run lint

smoke: ## ทดสอบระบบที่กำลังทำงานอยู่
	@./ops/scripts/smoke-test.sh http://localhost:$${APP_PORT:-8080}

backup: ## สำรองฐานข้อมูลทันที
	$(COMPOSE) exec backup backup.sh

restore: ## กู้คืนจากไฟล์สำรองข้อมูลล่าสุด (make restore F=/backups/xxx.dump เพื่อเลือกไฟล์)
	$(COMPOSE) exec -e CONFIRM=yes backup restore.sh $(or $(F),latest)

backup-drill: ## ซ้อมสำรอง+กู้คืนข้อมูลแบบครบวงจร
	@./ops/scripts/backup-drill.sh

monitoring: ## เปิดระบบเฝ้าระวัง (Prometheus/Grafana/Alertmanager)
	$(COMPOSE) --profile monitoring up -d

monitoring-down: ## ปิดเฉพาะระบบเฝ้าระวัง
	$(COMPOSE) --profile monitoring stop prometheus alertmanager grafana node-exporter cadvisor postgres-exporter blackbox-exporter

clean: ## ลบระบบพร้อมข้อมูลทั้งหมด (ระวัง: ข้อมูลในฐานข้อมูลจะหายไป)
	$(COMPOSE) --profile monitoring down -v
