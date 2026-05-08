from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import User, Campaign, CreditLog
import requests
from concurrent.futures import ThreadPoolExecutor

# =========================
# 🔥 CREATE USER
# =========================
@api_view(['POST'])
def create_user(request):
    try:
        username = str(
    request.data.get("username", "")
).strip().lower()
        username = str(
    request.data.get("username", "")
).strip().lower()
        role = request.data.get("role")
        parent_username = request.data.get("parent")

        if not username or not password:
            return Response({"status": "failed", "message": "Missing fields"})

        if User.objects.filter(username=username).exists():
            return Response({"status": "failed", "message": "User exists"})

        parent = None
        if parent_username:
            parent = User.objects.filter(username=parent_username).first()

        user = User.objects.create(
            username=username,
            password=password,
            role=role,
            parent=parent,
            credit=0,
            status="Active"
        )

        return Response({"status": "success", "user_id": user.id})

    except Exception as e:
        print("CREATE USER ERROR:", e)
        return Response({"status": "error"})


# =========================
# CREDIT HISTORY
# =========================
@api_view(['GET'])
def get_credit_logs(request):
    user_id = request.GET.get("user_id")

    logs = CreditLog.objects.filter(user_id=user_id).order_by("-created_at")

    data = []
    for l in logs:
        data.append({
            "username": l.user.username,
            "service": l.service,
            "credit": l.credit,
            "type": l.type,
            "transTime": l.created_at.strftime("%d-%m-%Y %H:%M"),
            "oldCredit": l.old_credit,
            "newCredit": l.new_credit,
            "sysnotes": "",
            "notes": l.notes,
            "results": l.results,
            "numbers": [r.get("number") for r in l.results if isinstance(r, dict)]
        })

    return Response(data)


# =========================
# GET USERS
# =========================
@api_view(['GET'])
def get_users(request):
    try:
        user_id = request.GET.get("user_id")
        user = User.objects.get(id=user_id)

        if user.role == "admin":
            users = User.objects.all()
        elif user.role == "reseller":
            users = User.objects.filter(parent=user)
        else:
            users = User.objects.filter(id=user.id)

        data = []
        for u in users:
            data.append({
                "id": u.id,
                "username": u.username,
                "email": "",
                "mobile": "",
                "role": u.role,
                "credit": u.credit,
                "status": u.status,
                "parent": u.parent.username if u.parent else None,
            })

        return Response(data)

    except Exception as e:
        print("GET USERS ERROR:", e)
        return Response([])


# =========================
# UPDATE USER
# =========================
@api_view(['POST'])
def update_user(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))

        old_credit = user.credit
        new_credit = int(request.data.get("credit", old_credit))

        if user.role == "reseller" and not user.parent:
            user.credit = new_credit
            user.save()

            CreditLog.objects.create(
                user=user,
                service="WHATSAPP",
                credit=abs(new_credit - old_credit),
                type="Credit",
                old_credit=old_credit,
                new_credit=new_credit,
                notes="Admin updated reseller credit"
            )

            return Response({"status": "success", "credit": user.credit})

        if user.parent:
            parent = user.parent
            diff = new_credit - old_credit

            if diff > 0:
                if parent.role != "admin" and parent.credit < diff:
                    return Response({"status": "failed", "message": "Not enough credit ❌"})
                if parent.role != "admin":
                    parent.credit -= diff
                    parent.save()
            elif diff < 0:
                parent.credit += abs(diff)
                parent.save()

        user.username = request.data.get("username", user.username)
        user.password = request.data.get("password", user.password)
        user.role = request.data.get("role", user.role)
        user.credit = new_credit
        user.save()

        CreditLog.objects.create(
            user=user,
            service="WHATSAPP",
            credit=abs(new_credit - old_credit),
            type="Credit" if new_credit > old_credit else "Debit",
            old_credit=old_credit,
            new_credit=new_credit,
            notes="Manual credit update"
        )

        return Response({"status": "success", "credit": user.credit})

    except Exception as e:
        print("UPDATE ERROR:", e)
        return Response({"status": "error"})


# =========================
# DELETE USER
# =========================
@api_view(['POST'])
def delete_user(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))
        user.delete()
        return Response({"status": "success"})
    except Exception as e:
        print("DELETE ERROR:", e)
        return Response({"status": "error"})


# =========================
# TOGGLE STATUS
# =========================
@api_view(['POST'])
def toggle_user_status(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))
        user.status = "Deactive" if user.status == "Active" else "Active"
        user.save()
        return Response({"status": "success", "new_status": user.status})
    except Exception as e:
        print("STATUS ERROR:", e)
        return Response({"status": "error"})


# =========================
# RESET PASSWORD
# =========================
@api_view(['POST'])
def reset_password(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))
        user.password = request.data.get("password")
        user.save()
        return Response({"status": "success"})
    except Exception as e:
        print("RESET ERROR:", e)
        return Response({"status": "error"})


# =========================
# LOGIN
# =========================
@api_view(['POST'])
def login(request):
    try:

        username = str(
            request.data.get("username", "")
        ).strip().lower()

        password = str(
            request.data.get("password", "")
        ).strip()

        user = User.objects.filter(
            username__iexact=username
        ).first()

        if not user:
            return Response({
                "status": "failed",
                "message": "Invalid username or password ❌"
            })

        if str(user.password).strip() != password:
            return Response({
                "status": "failed",
                "message": "Invalid username or password ❌"
            })

        if user.status != "Active":
            return Response({
                "status": "failed",
                "message": "Account disabled ❌"
            })

        return Response({
            "status": "success",
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "credit": user.credit
        })

    except Exception as e:
        print("LOGIN ERROR:", e)

        return Response({
            "status": "error"
        })

# =========================
# SEND SINGLE (NODE CALL)
# =========================
def send_single(number, message):
    try:
        number = number.strip()
        if not number.startswith("91"):
            number = "91" + number

        url = "http://localhost:5000/send-msg"
        res = requests.get(url, params={"number": number, "message": message}, timeout=10).json()
        return {"status": "success"} if res.get("status") == "sent" else {"status": "failed"}

    except Exception as e:
        print("SEND ERROR:", e)
        return {"status": "failed"}


# =========================
# 🔥 SEND CAMPAIGN — UPDATED
# Handles: instant (completed) + queue first-save (pending) + queue update (completed)
# =========================
@api_view(['POST'])
def send_whatsapp(request):
    try:
        results     = request.data.get("results", [])
        message     = request.data.get("message", "")
        total       = int(request.data.get("total", 0))
        user_id     = request.data.get("user_id")
        status      = request.data.get("status", "completed")   # 🔥 "pending" or "completed"
        campaign_id = request.data.get("campaign_id", None)      # 🔥 for queue update

        user = User.objects.get(id=user_id)
        print("🔥 RESULTS RECEIVED:", results)
        print("🔥 RESULTS TYPE:", type(results))
        print("🔥 RESULTS LENGTH:", len(results))

        # -----------------------------------------------
        # 🔥 CASE 1: Queue worker ne campaign update bheja
        # campaign_id aayega → existing campaign update karo
        # -----------------------------------------------
        if campaign_id:
            try:
                campaign = Campaign.objects.get(id=campaign_id)

                success = len([r for r in results if r.get("status") == "sent"])
                failed  = len([r for r in results if r.get("status") == "failed"])
                nonwa   = len([r for r in results if r.get("status") == "nonwa"])

                # Media extract
                media = []
                for r in results:
                    if isinstance(r, dict):
                        for f in r.get("files", []):
                            if isinstance(f, dict):
                                media.append({"name": f.get("name"), "type": f.get("type")})

                campaign.success = success
                campaign.failed  = failed
                campaign.nonwa   = nonwa
                campaign.media   = media
                campaign.results = results
                campaign.status  = "completed"   # 🔥 Mark done
                campaign.save()

                return Response({
                    "status": "ok",
                    "message": "Campaign marked completed",
                    "campaign_id": campaign.id,
                })

            except Campaign.DoesNotExist:
                pass  # Nahi mila to neeche fresh create karega

        # -----------------------------------------------
        # CREDIT CHECK
        # Admin ke liye credit check nahi — unlimited
        # -----------------------------------------------
        old_credit = user.credit

        if user.role != "admin":
            if user.credit < total:
                return Response({
                    "status": "failed",
                    "message": "Insufficient Balance ❌"
                })
            user.credit -= total
            user.save()

        # -----------------------------------------------
        # RESULT CALCULATION
        # Pending me sab "pending" hoga, completed me actual results
        # -----------------------------------------------
        if status == "pending":
            success = 0
            failed  = 0
            nonwa   = 0
        else:
            success = len([r for r in results if r.get("status") == "sent"])
            failed  = len([r for r in results if r.get("status") == "failed"])
            nonwa   = len([r for r in results if r.get("status") == "nonwa"])

        # Media extract
        media = []
        for r in results:
            if isinstance(r, dict):
                for f in r.get("files", []):
                    if isinstance(f, dict):
                        media.append({"name": f.get("name"), "type": f.get("type")})

        # -----------------------------------------------
        # SAVE CAMPAIGN
        # -----------------------------------------------
        campaign = Campaign.objects.create(
            user    = user,
            message = message,
            total   = total,
            success = success,
            failed  = failed,
            nonwa   = nonwa,
            media   = media,
            results = results,
            status  = status,   # 🔥 "pending" or "completed"
        )

        # -----------------------------------------------
        # CREDIT LOG (sirf completed ke liye — ya pending first save)
        # -----------------------------------------------
        CreditLog.objects.create(
            user       = user,
            service    = "WHATSAPP",
            credit     = total,
            type       = "Debit",
            old_credit = old_credit,
            new_credit = user.credit,
            notes      = f"Campaign {'queued' if status == 'pending' else 'sent'}",
            results    = results,
        )

        return Response({
            "status": "saved",
            "remaining_credit": user.credit,
            "campaign_id": campaign.id,   # 🔥 Frontend ko return karo — queue update ke liye
        })

    except Exception as e:
        print("SEND ERROR:", e)
        return Response({"status": "error"})


# =========================
# GET USER
# =========================
@api_view(['GET'])
def get_user(request):
    user_id = request.GET.get("user_id")
    try:
        user = User.objects.get(id=user_id)
        return Response({
            "id": user.id,
            "username": user.username,
            "credit": user.credit,
            "role": user.role
        })
    except:
        return Response({"status": "error"})


# =========================
# 🔥 GET CAMPAIGNS — UPDATED (status field added)
# =========================
@api_view(['GET'])
def get_campaigns(request):
    try:
        user_id = request.GET.get("user_id")
 
        if not user_id:
            return Response([])

        user = User.objects.get(id=user_id)

        # Role based data
        if user.role == "admin":
            campaigns = Campaign.objects.all().order_by("-created_at")
        elif user.role == "reseller":
            campaigns = Campaign.objects.filter(
                user__in=[user] + list(user.children.all())
            ).order_by("-created_at")
        else:
            campaigns = Campaign.objects.filter(user=user).order_by("-created_at")

        data = []
        for c in campaigns:
            data.append({
                "id": c.id,                          # 🔥 Campaign ID (queue update ke liye)
                "message": c.message,
                "total": c.total,
                "success": c.success,
                "failed": c.failed,
                "nonwa": getattr(c, "nonwa", 0),
                "rejected": getattr(c, "rejected", 0),
                "media": getattr(c, "media", []),
                "results": c.results,
                "status": c.status,                  # 🔥 "pending" or "completed"
                "created_at": c.created_at.isoformat(),
                "numbers": [
                    r.get("number") or r.get("phone") or r.get("mobile")
                    for r in c.results
                    if isinstance(r, dict)
                ],
            })

        return Response(data)

    except Exception as e:
        print("GET CAMPAIGN ERROR:", e)
        return Response([])