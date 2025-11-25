from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'username', 'email', 'password', 'confirm_password']
    
    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use.")
        return value

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return data

    def create(self, validated_data):
        user = User(
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            username=validated_data.get('username'),
            email=validated_data.get('email', ''),
        )
        user.set_password(validated_data['password'])
        user.save()

        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        super_data = super().validate(attrs)
        
        user = {
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "username": self.user.username,
            "email": self.user.email
        }

        tokens = {
            "refresh": super_data['refresh'],
            "access": super_data['access'],
        }

        return {
            "user": user,
            "tokens":tokens
        }