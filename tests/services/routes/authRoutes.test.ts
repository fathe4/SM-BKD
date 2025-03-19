// tests/routes/authRoutes.test.ts
import { expect } from "chai";
import sinon from "sinon";
import { AuthController } from "../../../src/controllers/authController";
import { UserService } from "../../../src/services/userService";
import { UserRole } from "@/types/models";

describe("Auth Controller", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      // Setup mocks
      const req: any = {
        body: {
          email: "test@example.com",
          password: "Password123",
          first_name: "Test",
          last_name: "User",
          username: "testuser",
        },
      };

      const res: any = {
        status: sinon.stub().returnsThis(),
        json: sinon.spy(),
      };

      // Stub UserService methods
      sinon.stub(UserService, "findUserByEmail").resolves(null);
      sinon.stub(UserService, "findUserByUsername").resolves(null);
      sinon.stub(UserService, "createUser").resolves({
        id: "test-uuid",
        email: req.body.email,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        username: req.body.username,
        password_hash: "hashedpassword123",
        role: UserRole.USER,
        is_verified: false,
        is_active: true,
        created_at: "",
        updated_at: "",
      });

      // Execute
      await AuthController.register(req, res);

      // Assert
      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0].status).to.equal("success");
    });
  });
});
