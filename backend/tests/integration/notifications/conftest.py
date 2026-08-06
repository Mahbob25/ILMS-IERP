import uuid
from unittest.mock import Mock

import pytest


def make_user(role_name: str, is_superadmin: bool = False):
    user = Mock()
    user.id = uuid.uuid4()
    user.is_superadmin = is_superadmin
    user.role = Mock()
    user.role.name = role_name
    return user


@pytest.fixture
def manager_user():
    return make_user("manager")


@pytest.fixture
def secretary_user():
    return make_user("secretary")


@pytest.fixture
def teacher_user():
    return make_user("teacher")


@pytest.fixture
def superadmin_user():
    return make_user("superadmin", is_superadmin=True)
