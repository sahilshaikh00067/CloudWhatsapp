from django.db import models


class User(models.Model):
    ROLE_CHOICES = (
        ("admin", "Admin"),
        ("reseller", "Reseller"),
        ("user", "User"),
    )

    username = models.CharField(max_length=100, unique=True)
    password = models.CharField(max_length=255)

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="user"
    )

    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children"
    )

    credit = models.IntegerField(default=0)

    status = models.CharField(
        max_length=10,
        default="Active"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.credit < 0:
            self.credit = 0
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"


class CreditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    service = models.CharField(max_length=50)
    credit = models.IntegerField()
    type = models.CharField(max_length=20)
    old_credit = models.IntegerField()
    new_credit = models.IntegerField()
    notes = models.TextField(blank=True)
    results = models.JSONField(default=list)  
    created_at = models.DateTimeField(auto_now_add=True)


class Campaign(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    message = models.TextField()
    total = models.IntegerField()
    success = models.IntegerField(default=0)
    failed = models.IntegerField(default=0)

    nonwa = models.IntegerField(default=0)
    rejected = models.IntegerField(default=0)

    media = models.JSONField(default=list)
    results = models.JSONField(default=list)

    # 🔥 NEW — "pending" or "completed"
    status = models.CharField(max_length=20, default="completed")

    created_at = models.DateTimeField(auto_now_add=True)