from django.urls import path
from . import views

urlpatterns = [

    # 🔐 AUTH
    path("login/", views.login),

    # 👤 USER
    path("create-user/", views.create_user),
    path("get-users/", views.get_users),
    path("update-user/", views.update_user),
    path("delete-user/", views.delete_user),
    path("toggle-status/", views.toggle_user_status),
    path("reset-password/", views.reset_password),

    # 📲 CAMPAIGN
    path("send-whatsapp/", views.send_whatsapp),
    path("get-credit-logs/", views.get_credit_logs),
    path("get-campaigns/", views.get_campaigns),
    path("get-user/", views.get_user),
]