"""
views.py — WhatsApp Campaign Platform
Django REST API — Production Grade
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db import transaction
from .models import User, Campaign, CreditLog


# ══════════════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ══════════════════════════════════════════════════════════════════

def _get_user(user_id):
    """
    Fetch user by id.
    Returns (user, None) on success, (None, Response) on failure.
    """
    if not user_id:
        return None, Response({"status": "failed", "message": "Missing user_id"})
    try:
        return User.objects.get(id=user_id), None
    except User.DoesNotExist:
        return None, Response({"status": "failed", "message": "User not found"})


def _serialize_user(u):
    return {
        "id":       u.id,
        "username": u.username,
        "email":    "",
        "mobile":   "",
        "role":     u.role,
        "credit":   u.credit,
        "status":   u.status,
        "parent":   u.parent.username if u.parent else None,
    }


def _serialize_campaign(c):
    return {
        "id":         c.id,
        "message":    c.message,
        "total":      c.total,
        "success":    c.success,
        "failed":     c.failed,
        "nonwa":      c.nonwa,
        "rejected":   c.rejected,
        "media":      c.media,
        "results":    c.results,
        "status":     c.status,
        "created_at": c.created_at.isoformat(),
        "numbers": [
            r.get("number") or r.get("phone") or r.get("mobile")
            for r in c.results
            if isinstance(r, dict)
        ],
    }


def _clean_results(raw):
    """
    Normalize Node.js result dicts into a consistent shape.
    Handles all number key variants sent by the Node server.
    """
    out = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        out.append({
            "number": (
                r.get("number") or r.get("phone") or
                r.get("mobile") or r.get("to") or ""
            ),
            "status": r.get("status", "unknown"),
            "files":  r.get("files", []),
        })
    return out


def _extract_media(results):
    """Pull flat media list from cleaned results."""
    media = []
    for r in results:
        for f in r.get("files", []):
            if isinstance(f, dict) and f.get("name"):
                media.append({"name": f["name"], "type": f.get("type", "")})
    return media


def _tally(results):
    """Count sent / failed / nonwa in one pass."""
    sent = failed = nonwa = 0
    for r in results:
        s = r.get("status")
        if s == "sent":   sent   += 1
        elif s == "failed": failed += 1
        elif s == "nonwa":  nonwa  += 1
    return sent, failed, nonwa


def _credit_log(user, service, credit, credit_type, old_credit, notes, results=None):
    CreditLog.objects.create(
        user       = user,
        service    = service,
        credit     = credit,
        type       = credit_type,
        old_credit = old_credit,
        new_credit = user.credit,
        notes      = notes,
        results    = results or [],
    )


# ══════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════

@api_view(["POST"])
def login(request):
    """
    POST /api/login/
    Body: { username, password }
    """
    try:
        username = str(request.data.get("username", "")).strip().lower()
        password = str(request.data.get("password", "")).strip()

        if not username or not password:
            return Response({"status": "failed", "message": "Missing credentials"})

        user = User.objects.filter(username__iexact=username).first()

        # Single error message prevents username enumeration
        if not user or str(user.password).strip() != password:
            return Response({"status": "failed", "message": "Invalid username or password ❌"})

        if user.status != "Active":
            return Response({"status": "failed", "message": "Account disabled ❌"})

        return Response({
            "status":   "success",
            "user_id":  user.id,
            "username": user.username,
            "role":     user.role,
            "credit":   user.credit,
        })

    except Exception as e:
        print("LOGIN ERROR:", e)
        return Response({"status": "error"})


# ══════════════════════════════════════════════════════════════════
# USER — CRUD
# ══════════════════════════════════════════════════════════════════

@api_view(["POST"])
def create_user(request):
    """
    POST /api/create-user/
    Body: { username, password, role, parent? }
    """
    try:
        username = str(request.data.get("username", "")).strip().lower()
        password = str(request.data.get("password", "")).strip()
        role     = request.data.get("role", "user")

        if not username or not password:
            return Response({"status": "failed", "message": "Missing fields"})

        if len(username) < 3:
            return Response({"status": "failed", "message": "Username too short"})

        if User.objects.filter(username=username).exists():
            return Response({"status": "failed", "message": "Username already exists"})

        parent = None
        parent_username = request.data.get("parent")
        if parent_username:
            parent = User.objects.filter(username=parent_username).first()
            if not parent:
                return Response({"status": "failed", "message": "Parent user not found"})

        user = User.objects.create(
            username = username,
            password = password,
            role     = role,
            parent   = parent,
            credit   = 0,
            status   = "Active",
        )

        return Response({"status": "success", "user_id": user.id})

    except Exception as e:
        print("CREATE USER ERROR:", e)
        return Response({"status": "error"})


@api_view(["GET"])
def get_user(request):
    """
    GET /api/get-user/?user_id=X
    Returns single user basic info (used for credit refresh in frontend).
    """
    user, err = _get_user(request.GET.get("user_id"))
    if err:
        return err
    return Response({
        "id":       user.id,
        "username": user.username,
        "credit":   user.credit,
        "role":     user.role,
    })


@api_view(["GET"])
def get_users(request):
    """
    GET /api/get-users/?user_id=X
    Admin → all users
    Reseller → own children only
    User → own record only
    """
    try:
        user, err = _get_user(request.GET.get("user_id"))
        if err:
            return Response([])

        if user.role == "admin":
            qs = User.objects.select_related("parent").all()
        elif user.role == "reseller":
            qs = User.objects.select_related("parent").filter(parent=user)
        else:
            qs = User.objects.filter(id=user.id)

        return Response([_serialize_user(u) for u in qs])

    except Exception as e:
        print("GET USERS ERROR:", e)
        return Response([])


@api_view(["POST"])
def update_user(request):
    """
    POST /api/update-user/
    Body: { user_id, username?, password?, role?, status?, credit? }

    Credit logic:
      - diff > 0 (adding credit to child) → deduct from parent (if parent is not admin)
      - diff < 0 (removing credit from child) → return to parent
    """
    try:
        user, err = _get_user(request.data.get("user_id"))
        if err:
            return err

        old_credit = int(user.credit or 0)

        # ── Field updates ──
        user.username = str(request.data.get("username", user.username)).strip().lower()
        user.password = str(request.data.get("password", user.password)).strip()
        user.role     = request.data.get("role",   user.role)
        user.status   = request.data.get("status", user.status)

        new_credit = int(request.data.get("credit", user.credit) or 0)
        diff = new_credit - old_credit

        # ── Parent credit transfer (atomic) ──
        with transaction.atomic():
            if user.parent and diff != 0:
                parent = User.objects.select_for_update().get(id=user.parent_id)

                if diff > 0:
                    # Adding credit to child — deduct from parent
                    if parent.role != "admin":
                        if parent.credit < diff:
                            return Response({
                                "status":  "failed",
                                "message": "Parent has insufficient balance ❌",
                            })
                        parent.credit -= diff
                    parent.save()

                else:
                    # Removing credit from child — return to parent
                    parent.credit += abs(diff)
                    parent.save()

            user.credit = new_credit
            user.save()

        # ── Credit log ──
        if diff != 0:
            _credit_log(
                user       = user,
                service    = "WHATSAPP",
                credit     = abs(diff),
                credit_type = "Credit" if diff > 0 else "Debit",
                old_credit  = old_credit,
                notes       = "Credit Added by Parent" if diff > 0 else "Credit Removed",
            )

        return Response({"status": "success"})

    except Exception as e:
        print("UPDATE USER ERROR:", e)
        return Response({"status": "failed"})


@api_view(["POST"])
def delete_user(request):
    """
    POST /api/delete-user/
    Body: { user_id }
    """
    try:
        user, err = _get_user(request.data.get("user_id"))
        if err:
            return err
        user.delete()
        return Response({"status": "success"})

    except Exception as e:
        print("DELETE ERROR:", e)
        return Response({"status": "error"})


@api_view(["POST"])
def toggle_user_status(request):
    """
    POST /api/toggle-status/
    Body: { user_id }
    Flips Active ↔ Deactive.
    """
    try:
        user, err = _get_user(request.data.get("user_id"))
        if err:
            return err
        user.status = "Deactive" if user.status == "Active" else "Active"
        user.save(update_fields=["status"])
        return Response({"status": "success", "new_status": user.status})

    except Exception as e:
        print("STATUS ERROR:", e)
        return Response({"status": "error"})


@api_view(["POST"])
def reset_password(request):
    """
    POST /api/reset-password/
    Body: { user_id, password }
    """
    try:
        user, err = _get_user(request.data.get("user_id"))
        if err:
            return err

        new_password = str(request.data.get("password", "")).strip()
        if not new_password:
            return Response({"status": "failed", "message": "Password cannot be empty"})

        user.password = new_password
        user.save(update_fields=["password"])
        return Response({"status": "success"})

    except Exception as e:
        print("RESET ERROR:", e)
        return Response({"status": "error"})


# ══════════════════════════════════════════════════════════════════
# CREDIT LOGS
# ══════════════════════════════════════════════════════════════════

@api_view(["GET"])
def get_credit_logs(request):
    """
    GET /api/get-credit-logs/?user_id=X
    Returns all credit transactions for a user, newest first.
    """
    user_id = request.GET.get("user_id")
    if not user_id:
        return Response([])

    logs = (
        CreditLog.objects
        .select_related("user")
        .filter(user_id=user_id)
        .order_by("-created_at")
    )

    return Response([
        {
            "username":  log.user.username,
            "service":   log.service,
            "credit":    log.credit,
            "type":      log.type,
            "transTime": log.created_at.strftime("%d-%m-%Y %H:%M"),
            "oldCredit": log.old_credit,
            "newCredit": log.new_credit,
            "sysnotes":  "",
            "notes":     log.notes,
            "results":   log.results,
            "numbers": [
                r.get("number") for r in log.results
                if isinstance(r, dict)
            ],
        }
        for log in logs
    ])


# ══════════════════════════════════════════════════════════════════
# CAMPAIGN
# ══════════════════════════════════════════════════════════════════

@api_view(["POST"])
def send_whatsapp(request):
    """
    POST /api/send-whatsapp/
    Called in 3 scenarios:

    1. INSTANT SEND (≤10 numbers, completed immediately by Node)
       Body: { results, message, total, user_id, status="completed" }

    2. QUEUE PRE-SAVE (>10 numbers, React pre-saves before Node queues)
       Body: { results, message, total, user_id, status="pending" }
       → Deducts credit, saves Campaign with status=pending, returns campaign_id

    3. QUEUE COMPLETION (Node worker calls back when done)
       Body: { results, message, total, user_id, campaign_id, status="completed" }
       → Updates existing Campaign with real results, marks completed
       → Does NOT deduct credit (already deducted in step 2)
    """
    try:
        d = request.data

        results     = d.get("results", [])
        message     = d.get("message", "")
        total       = int(d.get("total", 0))
        user_id     = d.get("user_id")
        status      = d.get("status", "completed")
        campaign_id = d.get("campaign_id")          # set only by Node worker callback

        user, err = _get_user(user_id)
        if err:
            return Response({"status": "error", "message": "User not found"})

        clean = _clean_results(results)

        # ── SCENARIO 3: Queue worker callback — update existing campaign ──
        if campaign_id:
            try:
                campaign = Campaign.objects.get(id=campaign_id)
                sent, failed, nonwa = _tally(clean)
                campaign.success = sent
                campaign.failed  = failed
                campaign.nonwa   = nonwa
                campaign.media   = _extract_media(clean)
                campaign.results = clean
                campaign.status  = "completed"
                campaign.save()
                return Response({
                    "status":      "ok",
                    "message":     "Campaign marked completed",
                    "campaign_id": campaign.id,
                })
            except Campaign.DoesNotExist:
                # campaign_id invalid — fall through to create new
                pass

        # ── SCENARIO 1 & 2: New campaign — credit check then save ──
        old_credit = user.credit

        if user.role != "admin":
            if user.credit < total:
                return Response({"status": "failed", "message": "Insufficient Balance ❌"})
            with transaction.atomic():
                # Re-fetch with lock to prevent double-spend
                locked_user = User.objects.select_for_update().get(id=user.id)
                if locked_user.credit < total:
                    return Response({"status": "failed", "message": "Insufficient Balance ❌"})
                locked_user.credit -= total
                locked_user.save(update_fields=["credit"])
                user.credit = locked_user.credit   # reflect locally

        # Tally (pending campaigns have 0/0/0 — results not processed yet)
        if status == "pending":
            sent = failed = nonwa = 0
        else:
            sent, failed, nonwa = _tally(clean)

        campaign = Campaign.objects.create(
            user    = user,
            message = message,
            total   = total,
            success = sent,
            failed  = failed,
            nonwa   = nonwa,
            media   = _extract_media(clean),
            results = clean,
            status  = status,
        )

        _credit_log(
            user        = user,
            service     = "WHATSAPP",
            credit      = total,
            credit_type = "Debit",
            old_credit  = old_credit,
            notes       = f"Campaign {'queued' if status == 'pending' else 'sent'}",
            results     = clean,
        )

        return Response({
            "status":           "saved",
            "remaining_credit": user.credit,
            "campaign_id":      campaign.id,
        })

    except Exception as e:
        print("SEND ERROR:", e)
        return Response({"status": "error"})


@api_view(["GET"])
def get_campaigns(request):
    """
    GET /api/get-campaigns/?user_id=X
    Admin   → all campaigns
    Reseller → own + children's campaigns
    User    → own campaigns only
    All ordered newest-first.
    """
    try:
        user, err = _get_user(request.GET.get("user_id"))
        if err:
            return Response([])

        if user.role == "admin":
            qs = Campaign.objects.select_related("user").order_by("-created_at")

        elif user.role == "reseller":
            child_ids = list(
                user.children.values_list("id", flat=True)
            )
            qs = Campaign.objects.select_related("user").filter(
                user_id__in=[user.id, *child_ids]
            ).order_by("-created_at")

        else:
            qs = Campaign.objects.filter(user=user).order_by("-created_at")

        return Response([_serialize_campaign(c) for c in qs])

    except Exception as e:
        print("GET CAMPAIGN ERROR:", e)
        return Response([])