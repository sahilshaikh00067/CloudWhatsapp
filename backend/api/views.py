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
        username = request.data.get("username")
        password = request.data.get("password")
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
    
#credit history 

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
            "notes": l.notes
        })

    return Response(data)


#get users

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
# 🔥 UPDATE USER
# =========================
@api_view(['POST'])
def update_user(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))

        old_credit = user.credit
        new_credit = int(request.data.get("credit", old_credit))

        # =========================
        # ADMIN → RESELLER
        # =========================
        if user.role == "reseller" and not user.parent:
            user.credit = new_credit
            user.save()

            # 🔥 LOG
            CreditLog.objects.create(
                user=user,
                service="WHATSAPP",
                credit=abs(new_credit - old_credit),
                type="Credit",
                old_credit=old_credit,
                new_credit=new_credit,
                notes="Admin updated reseller credit"
            )

            return Response({
                "status": "success",
                "credit": user.credit
            })

        # =========================
        # RESELLER → USER
        # =========================
        if user.parent:
            parent = user.parent
            diff = new_credit - old_credit

            # INCREASE
            if diff > 0:
                if parent.role != "admin" and parent.credit < diff:
                    return Response({
                        "status": "failed",
                        "message": "Not enough credit ❌"
                    })

                if parent.role != "admin":
                    parent.credit -= diff
                    parent.save()

            # DECREASE (RETURN)
            elif diff < 0:
                parent.credit += abs(diff)
                parent.save()

        # =========================
        # FINAL SAVE
        # =========================
        user.username = request.data.get("username", user.username)
        user.password = request.data.get("password", user.password)
        user.role = request.data.get("role", user.role)
        user.credit = new_credit
        user.save()

        # 🔥 LOG
        CreditLog.objects.create(
            user=user,
            service="WHATSAPP",
            credit=abs(new_credit - old_credit),
            type="Credit" if new_credit > old_credit else "Debit",
            old_credit=old_credit,
            new_credit=new_credit,
            notes="Manual credit update"
        )

        return Response({
            "status": "success",
            "credit": user.credit
        })

    except Exception as e:
        print("UPDATE ERROR:", e)
        return Response({"status": "error"})




# =========================
# 🔥 DELETE USER
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
# 🔥 TOGGLE STATUS
# =========================
@api_view(['POST'])
def toggle_user_status(request):
    try:
        user = User.objects.get(id=request.data.get("user_id"))

        user.status = "Deactive" if user.status == "Active" else "Active"
        user.save()

        return Response({
            "status": "success",
            "new_status": user.status
        })

    except Exception as e:
        print("STATUS ERROR:", e)
        return Response({"status": "error"})


# =========================
# 🔥 RESET PASSWORD
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
# 🔥 LOGIN
# =========================
@api_view(['POST'])
def login(request):
    try:
        user = User.objects.filter(
            username=request.data.get("username"),
            password=request.data.get("password")
        ).first()

        if not user:
            return Response({"status": "failed", "message": "Invalid login"})

        if user.status != "Active":
            return Response({"status": "failed", "message": "Account disabled"})

        return Response({
            "status": "success",
            "user_id": user.id,
            "username": user.username,
            "role": user.role,
            "credit": user.credit
        })

    except Exception as e:
        print("LOGIN ERROR:", e)
        return Response({"status": "error"})


# =========================
# 🔥 SEND SINGLE (NODE CALL)
# =========================
def send_single(number, message):
    try:
        number = number.strip()

        if not number.startswith("91"):
            number = "91" + number

        url = "http://localhost:5000/send-msg"

        res = requests.get(url, params={
            "number": number,
            "message": message
        }, timeout=10).json()

        return {"status": "success"} if res.get("status") == "sent" else {"status": "failed"}

    except Exception as e:
        print("SEND ERROR:", e)
        return {"status": "failed"}


# =========================
# 🔥 SEND CAMPAIGN
# =========================
@api_view(['POST'])
def send_whatsapp(request):
    try:
        results = request.data.get("results", [])
        message = request.data.get("message")
        total = int(request.data.get("total", 0))
        user_id = request.data.get("user_id")

        user = User.objects.get(id=user_id)

        # =========================
        # CREDIT CHECK
        # =========================
        old_credit = user.credit

        if user.role != "admin":
            if user.credit < total:
                return Response({
                    "status": "failed",
                    "message": "Insufficient Balance ❌"
                })

            user.credit -= total
            user.save()

        # =========================
        # RESULT CALCULATION
        # =========================
        success = len([r for r in results if r.get("status") == "sent"])
        failed = len([r for r in results if r.get("status") == "failed"])
        nonwa = len([r for r in results if r.get("status") == "nonwa"])

        # =========================
        # MEDIA
        # =========================
        media = []
        for r in results:
            if isinstance(r, dict) and "files" in r:
                media.extend(r["files"])

        # =========================
        # SAVE CAMPAIGN
        # =========================
        Campaign.objects.create(
            user=user,
            message=message,
            total=total,
            success=success,
            failed=failed,
            nonwa=nonwa,
            media=media,
            results=results
        )

        # 🔥 LOG (MOST IMPORTANT)
        CreditLog.objects.create(
            user=user,
            service="WHATSAPP",
            credit=total,
            type="Debit",
            old_credit=old_credit,
            new_credit=user.credit,
            notes="Campaign sent"
        )

        return Response({
            "status": "saved",
            "remaining_credit": user.credit
        })

    except Exception as e:
        print("SEND ERROR:", e)
        return Response({"status": "error"})    

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
# 🔥 GET CAMPAIGNS (DASHBOARD)
# =========================
@api_view(['GET'])
def get_campaigns(request):
    try:
        user_id = request.GET.get("user_id")

        if not user_id:
            return Response([])

        user = User.objects.get(id=user_id)

        # 🔥 ROLE BASED DATA
        if user.role == "admin":
            campaigns = Campaign.objects.all().order_by("-created_at")

        elif user.role == "reseller":
            # reseller + uske users ka data
            campaigns = Campaign.objects.filter(
                user__in=[user] + list(user.children.all())
            ).order_by("-created_at")

        else:
            # normal user → sirf apna data
            campaigns = Campaign.objects.filter(user=user).order_by("-created_at")

        data = []
        for c in campaigns:
            data.append({
                "message": c.message,
                "total": c.total,
                "success": c.success,
                "failed": c.failed,
                "nonwa": getattr(c, "nonwa", 0),
                "rejected": getattr(c, "rejected", 0),
                "media": getattr(c, "media", []),
                "created_at": c.created_at.isoformat()
            })

        return Response(data)

    except Exception as e:
        print("GET CAMPAIGN ERROR:", e)
        return Response([])